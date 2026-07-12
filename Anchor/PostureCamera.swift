//
//  PostureCamera.swift
//  Anchor (Echor)
//
//  Front-camera capture for posture monitoring. On TrueDepth devices a single
//  ARKit face-tracking session provides both camera frames (for Vision body
//  pose) and gaze data. Other devices fall back to plain AVCapture with the
//  eye-contact feature disabled — the two pipelines can't run at once because
//  ARKit owns the camera exclusively.
//
//  Privacy: every frame is analyzed in memory and immediately discarded.
//  Nothing is saved, recorded, or uploaded.
//

import ARKit
import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import QuartzCore
import SwiftUI
import UIKit
import Vision

/// Tracked upper-body landmarks in upright, normalized image coordinates
/// (Vision convention: origin bottom-left).
struct PostureLandmarks: @unchecked Sendable {
    var points: [VNHumanBodyPoseObservation.JointName: CGPoint]
    /// Width / height of the upright camera image, for aspect-fill mapping
    /// onto the preview.
    var imageAspect: CGFloat
}

/// One gaze reading from ARKit face tracking, as angles off the face's
/// forward axis.
struct GazeSample: Sendable {
    var horizontalAngle: Double
    var verticalAngle: Double
    var isTracked: Bool
}

final class PostureCameraEngine: NSObject, @unchecked Sendable {
    enum Mode {
        case arFaceTracking
        case avCapture
    }

    static var supportsEyeTracking: Bool { ARFaceTrackingConfiguration.isSupported }

    let mode: Mode
    let arSession = ARSession()
    let avSession = AVCaptureSession()

    /// Callbacks fire on the camera queue. Set both before calling `start()`.
    var onLandmarks: (@Sendable (PostureLandmarks) -> Void)?
    var onGaze: (@Sendable (GazeSample) -> Void)?

    /// The AV preview layer mirrors the front camera like a selfie view;
    /// ARSCNView shows the captured image unmirrored.
    var previewIsMirrored: Bool { mode == .avCapture }

    // Sample well below full frame rate to save battery (~8 Hz).
    private let sampleInterval: CFTimeInterval = 1.0 / 8.0
    private var lastSampleTime: CFTimeInterval = 0
    private var avConfigured = false
    private let cameraQueue = DispatchQueue(label: "posture.camera")

    override init() {
        mode = Self.supportsEyeTracking ? .arFaceTracking : .avCapture
        super.init()
    }

    func start() {
        switch mode {
        case .arFaceTracking:
            arSession.delegateQueue = cameraQueue
            arSession.delegate = self
            let configuration = ARFaceTrackingConfiguration()
            configuration.isLightEstimationEnabled = false
            arSession.run(configuration)
        case .avCapture:
            cameraQueue.async { [self] in
                configureAVSessionIfNeeded()
                if !avSession.isRunning {
                    avSession.startRunning()
                }
            }
        }
    }

    func stop() {
        switch mode {
        case .arFaceTracking:
            arSession.pause()
        case .avCapture:
            cameraQueue.async { [self] in
                if avSession.isRunning {
                    avSession.stopRunning()
                }
            }
        }
    }

    private func configureAVSessionIfNeeded() {
        guard !avConfigured else { return }
        avConfigured = true

        avSession.beginConfiguration()
        avSession.sessionPreset = .hd1280x720

        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
           let input = try? AVCaptureDeviceInput(device: device),
           avSession.canAddInput(input) {
            avSession.addInput(input)
        }

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: cameraQueue)
        if avSession.canAddOutput(output) {
            avSession.addOutput(output)
        }
        // Rotate buffers upright so Vision coordinates match the portrait UI.
        if let connection = output.connection(with: .video),
           connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }

        avSession.commitConfiguration()
    }

    private func detectBodyPose(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) {
        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation)
        try? handler.perform([request])
        guard let observation = request.results?.first else { return }

        let joints: [VNHumanBodyPoseObservation.JointName] = [
            .nose, .neck, .leftEar, .rightEar, .leftShoulder, .rightShoulder,
        ]
        var points: [VNHumanBodyPoseObservation.JointName: CGPoint] = [:]
        for joint in joints {
            if let point = try? observation.recognizedPoint(joint), point.confidence > 0.3 {
                points[joint] = point.location
            }
        }
        guard !points.isEmpty else { return }

        let width = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
        let height = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
        let rotated = orientation == .right || orientation == .left
        let aspect = rotated ? height / width : width / height
        onLandmarks?(PostureLandmarks(points: points, imageAspect: aspect))
    }
}

extension PostureCameraEngine: ARSessionDelegate {
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard frame.timestamp - lastSampleTime >= sampleInterval else { return }
        lastSampleTime = frame.timestamp

        if let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first {
            let look = face.lookAtPoint
            // lookAtPoint is in face space (+z out of the face); convert to
            // angles so a calibrated "center" can be compared against.
            let depth = max(look.z, 0.05)
            onGaze?(GazeSample(
                horizontalAngle: Double(atan2(look.x, depth)),
                verticalAngle: Double(atan2(look.y, depth)),
                isTracked: face.isTracked
            ))
        } else {
            onGaze?(GazeSample(horizontalAngle: 0, verticalAngle: 0, isTracked: false))
        }

        // ARKit frames arrive in landscape sensor orientation; .right maps
        // them upright for a portrait UI.
        detectBodyPose(in: frame.capturedImage, orientation: .right)
    }
}

extension PostureCameraEngine: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        let now = CACurrentMediaTime()
        guard now - lastSampleTime >= sampleInterval else { return }
        lastSampleTime = now
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        detectBodyPose(in: pixelBuffer, orientation: .up)
    }
}

/// Live front-camera preview for whichever pipeline is active.
struct PostureCameraPreview: UIViewRepresentable {
    let engine: PostureCameraEngine

    func makeUIView(context: Context) -> UIView {
        switch engine.mode {
        case .arFaceTracking:
            let view = ARSCNView()
            view.session = engine.arSession
            return view
        case .avCapture:
            let view = AVCapturePreviewUIView()
            view.previewLayer.session = engine.avSession
            view.previewLayer.videoGravity = .resizeAspectFill
            return view
        }
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

/// UIView whose backing layer is a camera preview layer.
final class AVCapturePreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
