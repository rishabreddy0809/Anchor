//
//  PostureView.swift
//  Anchor (Echor)
//
//  Live posture + eye-contact feedback. The colored border is the centerpiece:
//  green = good posture and looking at the screen, yellow = drifting,
//  red = posture broken or gaze away.
//

import SwiftUI
import Vision

struct PostureView: View {
    /// Owned by HomeView so monitoring keeps running (and the toolbar status
    /// chip stays live) after this sheet is dismissed.
    @ObservedObject var monitor: PostureMonitor

    var body: some View {
        VStack(spacing: 16) {
            header

            preview

            if let error = monitor.errorMessage {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            controls
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
    }

    private var header: some View {
        HStack {
            Text("Posture")
                .font(.title2.bold())
            Spacer()
        }
        .padding(.top, 12)
    }

    // MARK: - Camera preview + overlays

    private var preview: some View {
        ZStack {
            if let engine = monitor.engine {
                PostureCameraPreview(engine: engine)

                AlignmentGuideOverlay()

                if monitor.isCalibrating, let landmarks = monitor.landmarks {
                    SkeletonOverlay(landmarks: landmarks, mirrored: engine.previewIsMirrored)
                }

                VStack {
                    privacyBadge
                        .padding(.top, 12)
                    Spacer()
                    if monitor.isCalibrating {
                        calibrationBanner
                            .padding(.bottom, 16)
                    }
                }
                .padding(.horizontal, 16)

                if monitor.showCheckmark {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 96))
                        .foregroundStyle(.green)
                        .shadow(radius: 8)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                }
            } else {
                Color(.secondarySystemBackground)
                VStack(spacing: 10) {
                    Image(systemName: "camera")
                        .font(.system(size: 40))
                        .foregroundStyle(.secondary)
                    Text("Camera is off")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .animation(.spring(duration: 0.4), value: monitor.showCheckmark)
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .strokeBorder(statusColor, lineWidth: 6)
        )
        .animation(.easeInOut(duration: 0.3), value: statusColor)
    }

    private var statusColor: Color {
        guard monitor.isRunning else { return .gray.opacity(0.35) }
        guard monitor.baseline != nil else { return .gray }
        switch monitor.status {
        case .good: return .green
        case .warning: return .yellow
        case .bad: return .red
        }
    }

    /// Recording is always disclosed while the camera runs.
    private var privacyBadge: some View {
        Group {
            if monitor.isRunning {
                HStack(spacing: 6) {
                    Circle()
                        .fill(.red)
                        .frame(width: 8, height: 8)
                    Text("Camera is active — nothing is recorded")
                        .font(.footnote.weight(.medium))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.thinMaterial, in: Capsule())
            }
        }
    }

    private var calibrationBanner: some View {
        VStack(spacing: 8) {
            Text("Sit up straight, look at the screen, hold still…")
                .font(.footnote.weight(.medium))
            ProgressView(value: monitor.calibrationProgress)
                .tint(.green)
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(spacing: 12) {
            if monitor.isRunning {
                Button(monitor.baseline == nil ? "Calibrate" : "Recalibrate") {
                    monitor.startCalibration()
                }
                .buttonStyle(.bordered)
                .disabled(monitor.isCalibrating)

                if !monitor.eyeTrackingAvailable {
                    Text("Eye-contact tracking isn't supported on this device — posture only.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            Button {
                if monitor.isRunning {
                    monitor.stop()
                } else {
                    Task {
                        await monitor.start()
                    }
                }
            } label: {
                Label(
                    monitor.isRunning ? "Stop Monitoring" : "Start Monitoring",
                    systemImage: monitor.isRunning ? "stop.circle.fill" : "camera.circle.fill"
                )
                .font(.headline)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .tint(monitor.isRunning ? .red : .accentColor)
        }
    }
}

/// Center silhouette + two vertical side lines the shoulders should stay
/// between.
struct AlignmentGuideOverlay: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height

            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: w * 0.22, y: h * 0.25))
                    p.addLine(to: CGPoint(x: w * 0.22, y: h * 0.85))
                    p.move(to: CGPoint(x: w * 0.78, y: h * 0.25))
                    p.addLine(to: CGPoint(x: w * 0.78, y: h * 0.85))
                }
                .stroke(Color.white.opacity(0.35), style: StrokeStyle(lineWidth: 2, dash: [6, 6]))

                Path { p in
                    // Head outline.
                    p.addEllipse(in: CGRect(
                        x: w * 0.5 - w * 0.13,
                        y: h * 0.30 - w * 0.16,
                        width: w * 0.26,
                        height: w * 0.32
                    ))
                    // Shoulder line.
                    p.move(to: CGPoint(x: w * 0.25, y: h * 0.62))
                    p.addQuadCurve(
                        to: CGPoint(x: w * 0.75, y: h * 0.62),
                        control: CGPoint(x: w * 0.5, y: h * 0.48)
                    )
                }
                .stroke(Color.white.opacity(0.5), lineWidth: 2)
            }
        }
        .allowsHitTesting(false)
    }
}

/// Tracked joints drawn over the preview during calibration so the user can
/// see what's being measured.
struct SkeletonOverlay: View {
    let landmarks: PostureLandmarks
    let mirrored: Bool

    var body: some View {
        GeometryReader { geo in
            let points = landmarks.points.mapValues { viewPoint(for: $0, in: geo.size) }

            ZStack {
                if let left = points[.leftShoulder], let right = points[.rightShoulder] {
                    Path { p in
                        p.move(to: left)
                        p.addLine(to: right)
                    }
                    .stroke(Color.cyan.opacity(0.8), lineWidth: 3)
                }

                ForEach(Array(points.keys), id: \.rawValue) { joint in
                    if let point = points[joint] {
                        Circle()
                            .fill(Color.cyan)
                            .frame(width: 10, height: 10)
                            .position(point)
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    /// Maps a Vision-normalized point (origin bottom-left) onto the
    /// aspect-filled, possibly mirrored preview.
    private func viewPoint(for point: CGPoint, in size: CGSize) -> CGPoint {
        var x = point.x
        var y = 1 - point.y
        if mirrored {
            x = 1 - x
        }

        let viewAspect = size.width / size.height
        if landmarks.imageAspect > viewAspect {
            // Image is wider than the view: sides are cropped off.
            let scale = landmarks.imageAspect / viewAspect
            x = (x - 0.5) * scale + 0.5
        } else {
            // Image is taller: top/bottom are cropped off.
            let scale = viewAspect / landmarks.imageAspect
            y = (y - 0.5) * scale + 0.5
        }
        return CGPoint(x: x * size.width, y: y * size.height)
    }
}

#Preview {
    PostureView(monitor: PostureMonitor())
}
