//
//  PostureMonitor.swift
//  Anchor (Echor)
//
//  Turns camera landmarks + gaze samples into calibrated posture feedback:
//  green (good), yellow (drifting), red (posture broken or gaze away).
//
//  All thresholds are deviations from the user's own calibrated neutral pose,
//  measured in units of shoulder width so distance from the camera cancels
//  out — no hardcoded universal values.
//

import AVFoundation
import Combine
import Foundation
import UIKit
import UserNotifications
import Vision

/// The user's personal "sitting straight, looking at the screen" reference,
/// captured during the 3-second calibration hold.
struct PostureBaseline: Codable, Sendable {
    var headOffset: Double
    var shoulderDelta: Double
    var gazeHorizontal: Double?
    var gazeVertical: Double?
}

enum PostureStatus: Sendable {
    case good
    case warning
    case bad
}

@MainActor
final class PostureMonitor: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var status: PostureStatus = .good
    @Published private(set) var gazeOnScreen = true
    @Published private(set) var isCalibrating = false
    @Published private(set) var calibrationProgress: Double = 0
    @Published private(set) var landmarks: PostureLandmarks?
    @Published private(set) var showCheckmark = false
    @Published private(set) var baseline: PostureBaseline?
    @Published private(set) var engine: PostureCameraEngine?
    @Published var errorMessage: String?

    let eyeTrackingAvailable = PostureCameraEngine.supportsEyeTracking

    // Deviation-from-baseline thresholds, in shoulder-width units.
    private let warningThreshold = 0.15
    private let badThreshold = 0.30
    private let gazeAngleThreshold = 12.0 * .pi / 180
    private let gazeGracePeriod: TimeInterval = 2
    private let alertGracePeriod: TimeInterval = 3
    private let alertCooldown: TimeInterval = 30
    private let checkmarkHold: TimeInterval = 3
    private let calibrationDuration: TimeInterval = 3
    private let smoothingAlpha = 0.3

    private var smoothedHeadOffset: Double?
    private var smoothedShoulderDelta: Double?
    private var lastPostureLevel: PostureStatus = .good

    private var gazeAwaySince: Date?
    private var badSince: Date?
    private var goodSince: Date?
    private var checkmarkArmed = true
    private var lastAlertDate: Date?

    private var calibrationSamples: [(head: Double, shoulder: Double)] = []
    private var calibrationGazeSamples: [(h: Double, v: Double)] = []
    private var calibrationStart: Date?

    private let baselineKey = "posture.baseline"
    private let notificationPresenter = PostureNotificationPresenter()

    init() {
        if let data = UserDefaults.standard.data(forKey: baselineKey),
           let saved = try? JSONDecoder().decode(PostureBaseline.self, from: data) {
            baseline = saved
        }
    }

    func start() async {
        guard !isRunning else { return }
        guard await AVCaptureDevice.requestAccess(for: .video) else {
            errorMessage = "Camera access is required for posture feedback — enable it in Settings."
            return
        }
        errorMessage = nil

        let center = UNUserNotificationCenter.current()
        center.delegate = notificationPresenter
        _ = try? await center.requestAuthorization(options: [.alert, .sound])

        let engine = PostureCameraEngine()
        engine.onLandmarks = { [weak self] landmarks in
            Task { @MainActor in self?.handle(landmarks) }
        }
        engine.onGaze = { [weak self] sample in
            Task { @MainActor in self?.handle(sample) }
        }
        self.engine = engine
        engine.start()
        isRunning = true

        // First launch: run calibration automatically once the camera is up.
        if baseline == nil {
            try? await Task.sleep(for: .seconds(1))
            if isRunning && baseline == nil && !isCalibrating {
                startCalibration()
            }
        }
    }

    func stop() {
        engine?.stop()
        engine = nil
        isRunning = false
        isCalibrating = false
        landmarks = nil
        smoothedHeadOffset = nil
        smoothedShoulderDelta = nil
        lastPostureLevel = .good
        gazeAwaySince = nil
        badSince = nil
        goodSince = nil
        gazeOnScreen = true
        status = .good
        showCheckmark = false
        checkmarkArmed = true
    }

    func startCalibration() {
        guard isRunning else { return }
        calibrationSamples = []
        calibrationGazeSamples = []
        calibrationStart = Date()
        calibrationProgress = 0
        isCalibrating = true
    }

    // MARK: - Frame handling

    private func handle(_ landmarks: PostureLandmarks) {
        self.landmarks = landmarks
        guard let metrics = Self.metrics(from: landmarks) else { return }

        smoothedHeadOffset = smoothed(previous: smoothedHeadOffset, new: metrics.head)
        smoothedShoulderDelta = smoothed(previous: smoothedShoulderDelta, new: metrics.shoulder)

        if isCalibrating {
            collectCalibrationSample(metrics)
        } else {
            evaluatePosture()
        }
    }

    private func handle(_ sample: GazeSample) {
        if isCalibrating {
            if sample.isTracked {
                calibrationGazeSamples.append((sample.horizontalAngle, sample.verticalAngle))
            }
            return
        }

        let centerH = baseline?.gazeHorizontal ?? 0
        let centerV = baseline?.gazeVertical ?? 0
        let away = !sample.isTracked
            || abs(sample.horizontalAngle - centerH) > gazeAngleThreshold
            || abs(sample.verticalAngle - centerV) > gazeAngleThreshold

        if away {
            let since = gazeAwaySince ?? Date()
            gazeAwaySince = since
            if Date().timeIntervalSince(since) > gazeGracePeriod {
                gazeOnScreen = false
            }
        } else {
            gazeAwaySince = nil
            gazeOnScreen = true
        }
        updateStatus()
    }

    /// Forward head lean and shoulder tilt from one set of landmarks, in
    /// shoulder-width units. Nil when too few joints are confidently tracked.
    private static func metrics(from landmarks: PostureLandmarks) -> (head: Double, shoulder: Double)? {
        let points = landmarks.points
        guard let left = points[.leftShoulder], let right = points[.rightShoulder] else { return nil }
        let shoulderWidth = abs(left.x - right.x)
        guard shoulderWidth > 0.05 else { return nil }

        let earXs = [points[.leftEar]?.x, points[.rightEar]?.x].compactMap { $0 }
        guard !earXs.isEmpty else { return nil }
        let earX = earXs.reduce(0, +) / CGFloat(earXs.count)
        let shoulderMidX = (left.x + right.x) / 2

        let head = Double(abs(earX - shoulderMidX) / shoulderWidth)
        let shoulder = Double(abs(left.y - right.y) / shoulderWidth)
        return (head, shoulder)
    }

    private func smoothed(previous: Double?, new: Double) -> Double {
        guard let previous else { return new }
        return previous * (1 - smoothingAlpha) + new * smoothingAlpha
    }

    // MARK: - Calibration

    private func collectCalibrationSample(_ metrics: (head: Double, shoulder: Double)) {
        guard let start = calibrationStart else { return }
        calibrationSamples.append(metrics)

        let elapsed = Date().timeIntervalSince(start)
        calibrationProgress = min(elapsed / calibrationDuration, 1)
        guard elapsed >= calibrationDuration else { return }

        let count = Double(calibrationSamples.count)
        var newBaseline = PostureBaseline(
            headOffset: calibrationSamples.map(\.head).reduce(0, +) / count,
            shoulderDelta: calibrationSamples.map(\.shoulder).reduce(0, +) / count
        )
        if !calibrationGazeSamples.isEmpty {
            let gazeCount = Double(calibrationGazeSamples.count)
            newBaseline.gazeHorizontal = calibrationGazeSamples.map(\.h).reduce(0, +) / gazeCount
            newBaseline.gazeVertical = calibrationGazeSamples.map(\.v).reduce(0, +) / gazeCount
        }

        baseline = newBaseline
        if let data = try? JSONEncoder().encode(newBaseline) {
            UserDefaults.standard.set(data, forKey: baselineKey)
        }
        isCalibrating = false
        gazeAwaySince = nil
        gazeOnScreen = true
        badSince = nil
        goodSince = nil
    }

    // MARK: - Status

    private func evaluatePosture() {
        guard let baseline,
              let head = smoothedHeadOffset,
              let shoulder = smoothedShoulderDelta else { return }

        let deviation = max(head - baseline.headOffset, shoulder - baseline.shoulderDelta)
        if deviation > badThreshold {
            lastPostureLevel = .bad
        } else if deviation > warningThreshold {
            lastPostureLevel = .warning
        } else {
            lastPostureLevel = .good
        }
        updateStatus()
    }

    private func updateStatus() {
        guard baseline != nil else {
            status = .good
            return
        }

        let combined: PostureStatus = (lastPostureLevel == .bad || !gazeOnScreen) ? .bad : lastPostureLevel
        status = combined
        let now = Date()

        switch combined {
        case .bad:
            goodSince = nil
            checkmarkArmed = true
            let since = badSince ?? now
            badSince = since
            let cooledDown = lastAlertDate.map { now.timeIntervalSince($0) > alertCooldown } ?? true
            if now.timeIntervalSince(since) >= alertGracePeriod && cooledDown {
                lastAlertDate = now
                sendAlert()
            }
        case .warning:
            badSince = nil
            goodSince = nil
            checkmarkArmed = true
        case .good:
            badSince = nil
            let since = goodSince ?? now
            goodSince = since
            if checkmarkArmed && now.timeIntervalSince(since) >= checkmarkHold {
                checkmarkArmed = false
                flashCheckmark()
            }
        }
    }

    private func flashCheckmark() {
        showCheckmark = true
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1.6))
            self?.showCheckmark = false
        }
    }

    private func sendAlert() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)

        let content = UNMutableNotificationContent()
        content.title = "Posture check"
        content.body = "Sit back up and look at the screen when you're ready."
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

/// Lets the posture reminder show as a banner while the app is foreground.
final class PostureNotificationPresenter: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner]
    }
}
