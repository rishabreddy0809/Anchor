//
//  SpeechManager.swift
//  Anchor (Echor)
//
//  Live on-device speech-to-text with a rolling 3-minute transcript buffer.
//
//  Privacy: audio is never written to disk or uploaded. Recognition runs
//  on-device only (requiresOnDeviceRecognition = true), and the transcript
//  text never leaves this class except to the on-device FoundationModels
//  summarizer.
//

import AVFoundation
import Combine
import Foundation
import Speech

/// Hands audio buffers from the audio thread to whichever recognition request
/// is currently active. The tap callback runs off the main actor, so this box
/// is the only thing it touches.
nonisolated final class RecognitionRequestBox: @unchecked Sendable {
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?

    func set(_ newRequest: SFSpeechAudioBufferRecognitionRequest?) {
        lock.lock()
        request = newRequest
        lock.unlock()
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        request?.append(buffer)
        lock.unlock()
    }
}

@MainActor
final class SpeechManager: ObservableObject {
    @Published private(set) var isListening = false
    @Published var errorMessage: String?

    /// The last 3 minutes of transcribed speech, oldest first.
    struct TranscriptChunk {
        let timestamp: Date
        let text: String
    }

    static let windowDuration: TimeInterval = 3 * 60
    /// iOS caps continuous recognition sessions at ~1 minute, so we chain a
    /// fresh request slightly before the limit. The audio engine keeps running
    /// across the swap, so no audio is dropped during the handoff.
    private static let segmentDuration: TimeInterval = 50

    private var chunks: [TranscriptChunk] = []
    private var currentPartial = ""
    /// Everything transcribed since the current recording started, unlike
    /// `chunks` which is trimmed to the rolling 3-minute window.
    private var sessionParts: [String] = []

    private let audioEngine = AVAudioEngine()
    private let requestBox = RecognitionRequestBox()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var restartTimer: Timer?
    /// Bumped on every segment swap so late callbacks from a finished segment
    /// can't clobber the new segment's text.
    private var generation = 0

    // MARK: - Public API

    func startListening() {
        guard !isListening else { return }
        errorMessage = nil
        sessionParts = []

        Task {
            guard await requestPermissions() else {
                errorMessage = "Echor needs microphone and speech recognition access. Enable both in Settings."
                return
            }
            beginAudioSession()
        }
    }

    func stopListening() {
        restartTimer?.invalidate()
        restartTimer = nil
        generation += 1

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        requestBox.set(nil)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil

        commitCurrentPartial()
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// The trailing window of transcribed text, trimmed to the last 3 minutes.
    func rollingTranscript() -> String {
        trimExpiredChunks()
        var parts = chunks.map(\.text)
        if !currentPartial.isEmpty {
            parts.append(currentPartial)
        }
        return parts.joined(separator: " ")
    }

    /// The full transcript of the current (or just-finished) recording.
    /// Call after `stopListening()` so the final partial is included.
    func sessionTranscript() -> String {
        var parts = sessionParts
        if !currentPartial.isEmpty {
            parts.append(currentPartial)
        }
        return parts.joined(separator: " ")
    }

    // MARK: - Setup

    private func requestPermissions() async -> Bool {
        let speechGranted = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
        guard speechGranted else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    private func beginAudioSession() {
        let localRecognizer = SFSpeechRecognizer() ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        guard let localRecognizer, localRecognizer.isAvailable else {
            errorMessage = "Speech recognition isn't available on this device right now."
            return
        }
        guard localRecognizer.supportsOnDeviceRecognition else {
            errorMessage = "On-device speech recognition isn't supported for this language, and Echor never sends audio off-device."
            return
        }
        recognizer = localRecognizer

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            startRecognitionSegment()

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [box = requestBox] buffer, _ in
                box.append(buffer)
            }
            audioEngine.prepare()
            try audioEngine.start()

            isListening = true
            restartTimer = Timer.scheduledTimer(withTimeInterval: Self.segmentDuration, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.restartSegment()
                }
            }
        } catch {
            errorMessage = "Couldn't start the microphone: \(error.localizedDescription)"
            stopListening()
        }
    }

    // MARK: - Segment chaining

    private func startRecognitionSegment() {
        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest
        requestBox.set(newRequest)

        generation += 1
        let segmentGeneration = generation

        task = recognizer?.recognitionTask(with: newRequest) { [weak self] result, _ in
            Task { @MainActor in
                guard let self, segmentGeneration == self.generation, let result else { return }
                self.currentPartial = result.bestTranscription.formattedString
                if result.isFinal {
                    self.commitCurrentPartial()
                }
            }
        }
    }

    private func restartSegment() {
        guard isListening else { return }
        // Bank the current segment's text before swapping so nothing is lost
        // during the handoff, then invalidate the old task's callbacks.
        commitCurrentPartial()
        request?.endAudio()
        task?.finish()
        startRecognitionSegment()
    }

    // MARK: - Buffer maintenance

    private func commitCurrentPartial() {
        let text = currentPartial.trimmingCharacters(in: .whitespacesAndNewlines)
        currentPartial = ""
        guard !text.isEmpty else { return }
        chunks.append(TranscriptChunk(timestamp: Date(), text: text))
        sessionParts.append(text)
        trimExpiredChunks()
    }

    private func trimExpiredChunks() {
        let cutoff = Date().addingTimeInterval(-Self.windowDuration)
        chunks.removeAll { $0.timestamp < cutoff }
    }
}
