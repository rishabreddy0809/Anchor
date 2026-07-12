//
//  OnboardingView.swift
//  Anchor (Echor)
//
//  Multi-page first-run experience: welcome, feature tour, name capture,
//  and permission priming. Completion is stored in AppStorage so the flow
//  only runs once.
//

import AVFoundation
import Speech
import SwiftUI

struct OnboardingView: View {
    @AppStorage("userName") private var userName = ""
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    @State private var page = 0
    @State private var name = ""
    @State private var micGranted = AVAudioApplication.shared.recordPermission == .granted
    @State private var speechGranted = SFSpeechRecognizer.authorizationStatus() == .authorized
    @FocusState private var nameFieldFocused: Bool

    private static let pageCount = 4

    var body: some View {
        ZStack {
            OnboardingBackground()

            VStack(spacing: 0) {
                TabView(selection: $page) {
                    welcomePage.tag(0)
                    featuresPage.tag(1)
                    namePage.tag(2)
                    permissionsPage.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: page)

                pageDots
                    .padding(.bottom, 24)

                continueButton
                    .padding(.horizontal, 28)
                    .padding(.bottom, 28)
            }
        }
        .preferredColorScheme(.dark)
        .onChange(of: page) {
            nameFieldFocused = false
        }
    }

    // MARK: - Pages

    private var welcomePage: some View {
        OnboardingPage(
            symbol: "waveform.circle.fill",
            symbolTint: .cyan,
            title: "Welcome to Echor",
            subtitle: "Your personal class companion. Record lectures, get instant AI recaps, and never lose the thread again."
        )
    }

    private var featuresPage: some View {
        VStack(spacing: 28) {
            Spacer()

            Text("Everything you need\nto stay on track")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .multilineTextAlignment(.center)

            VStack(spacing: 14) {
                FeatureRow(
                    symbol: "mic.fill",
                    tint: .red,
                    title: "Record any class",
                    detail: "One tap starts a live, on-device transcription of your lecture."
                )
                FeatureRow(
                    symbol: "sparkles",
                    tint: .yellow,
                    title: "Catch Me Up",
                    detail: "Zoned out? Get a plain-English recap of the last few minutes, instantly."
                )
                FeatureRow(
                    symbol: "square.grid.2x2.fill",
                    tint: .cyan,
                    title: "Your class dashboard",
                    detail: "Sessions are organized by subject with recaps and full transcripts."
                )
                FeatureRow(
                    symbol: "lock.shield.fill",
                    tint: .green,
                    title: "Private by design",
                    detail: "Audio and transcripts never leave your device. No servers, ever."
                )
            }
            .padding(.horizontal, 24)

            Spacer()
            Spacer()
        }
    }

    private var namePage: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "person.crop.circle.badge.checkmark")
                .font(.system(size: 72))
                .foregroundStyle(.cyan)
                .padding(28)
                .glassEffect(.regular, in: .circle)

            Text("What should we\ncall you?")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .multilineTextAlignment(.center)

            Text("Your name stays on this device — it just makes Echor feel like yours.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            TextField("Your name", text: $name)
                .textContentType(.givenName)
                .focused($nameFieldFocused)
                .submitLabel(.done)
                .onSubmit { advance() }
                .font(.system(.title2, design: .rounded, weight: .semibold))
                .multilineTextAlignment(.center)
                .padding(.vertical, 16)
                .padding(.horizontal, 24)
                .glassEffect(.regular, in: .rect(cornerRadius: 20))
                .padding(.horizontal, 40)

            Spacer()
            Spacer()
        }
    }

    private var permissionsPage: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("A couple of\npermissions")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .multilineTextAlignment(.center)

            Text("Echor needs these to hear and transcribe your classes. Everything stays on-device.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            VStack(spacing: 14) {
                PermissionRow(
                    symbol: "mic.fill",
                    tint: .red,
                    title: "Microphone",
                    detail: "To hear the lecture as it happens.",
                    granted: micGranted
                ) {
                    Task {
                        micGranted = await AVAudioApplication.requestRecordPermission()
                    }
                }
                PermissionRow(
                    symbol: "text.bubble.fill",
                    tint: .cyan,
                    title: "Speech Recognition",
                    detail: "To turn speech into text, entirely on-device.",
                    granted: speechGranted
                ) {
                    SFSpeechRecognizer.requestAuthorization { status in
                        Task { @MainActor in
                            speechGranted = status == .authorized
                        }
                    }
                }
            }
            .padding(.horizontal, 24)

            Spacer()
            Spacer()
        }
    }

    // MARK: - Chrome

    private var pageDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<Self.pageCount, id: \.self) { index in
                Capsule()
                    .fill(index == page ? Color.white : Color.white.opacity(0.3))
                    .frame(width: index == page ? 24 : 8, height: 8)
                    .animation(.spring(duration: 0.3), value: page)
            }
        }
    }

    private var continueButton: some View {
        Button(action: advance) {
            Text(page == Self.pageCount - 1 ? "Get Started" : "Continue")
                .font(.system(.headline, design: .rounded))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        .tint(.cyan)
    }

    private func advance() {
        if page < Self.pageCount - 1 {
            page += 1
        } else {
            userName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            withAnimation(.easeInOut(duration: 0.4)) {
                hasCompletedOnboarding = true
            }
        }
    }
}

// MARK: - Building blocks

private struct OnboardingPage: View {
    let symbol: String
    let symbolTint: Color
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: symbol)
                .font(.system(size: 88))
                .foregroundStyle(symbolTint)
                .padding(36)
                .glassEffect(.regular, in: .circle)
                .shadow(color: symbolTint.opacity(0.4), radius: 40)

            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .multilineTextAlignment(.center)

            Text(subtitle)
                .font(.title3)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 36)

            Spacer()
            Spacer()
        }
    }
}

private struct FeatureRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(.headline, design: .rounded))
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 20))
    }
}

private struct PermissionRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let detail: String
    let granted: Bool
    let request: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(.headline, design: .rounded))
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if granted {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.green)
                    .transition(.scale.combined(with: .opacity))
            } else {
                Button("Allow", action: request)
                    .buttonStyle(.glass)
                    .tint(tint)
            }
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 20))
        .animation(.spring(duration: 0.35), value: granted)
    }
}

/// Deep gradient backdrop with slowly drifting glow orbs.
private struct OnboardingBackground: View {
    @State private var drift = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.05, blue: 0.18),
                    Color(red: 0.13, green: 0.07, blue: 0.32),
                    Color(red: 0.02, green: 0.12, blue: 0.28)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color.cyan.opacity(0.25))
                .frame(width: 320)
                .blur(radius: 90)
                .offset(x: drift ? -110 : 90, y: drift ? -260 : -180)

            Circle()
                .fill(Color.purple.opacity(0.3))
                .frame(width: 360)
                .blur(radius: 100)
                .offset(x: drift ? 130 : -80, y: drift ? 260 : 340)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }
}

#Preview {
    OnboardingView()
}
