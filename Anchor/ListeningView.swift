//
//  ListeningView.swift
//  Anchor (Echor)
//
//  Shared listening UI components used by HomeView: the always-visible
//  mic disclosure indicator and the "Catch Me Up" recap sheet.
//

import SwiftUI

/// Pulsing dot + label shown whenever the microphone is live. Part of the
/// app's "recording is always disclosed" design principle.
struct ListeningIndicator: View {
    let active: Bool
    @State private var pulsing = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(active ? Color.red : Color.gray)
                .frame(width: 12, height: 12)
                .scaleEffect(active && pulsing ? 1.35 : 1.0)
                .opacity(active ? (pulsing ? 0.5 : 1.0) : 0.5)
                .animation(
                    active ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true) : .default,
                    value: pulsing
                )
            Text(active ? "Listening — audio stays on this device" : "Mic off")
                .font(.footnote.weight(.medium))
                .foregroundStyle(active ? .primary : .secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .glassEffect()
        .onAppear { pulsing = true }
    }
}

struct RecapSheet: View {
    @ObservedObject var recapService: RecapService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if recapService.isGenerating {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Catching you up…")
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 48)
                    } else if let error = recapService.errorMessage {
                        Text(error)
                            .foregroundStyle(.red)
                    } else if let recap = recapService.recap {
                        Text(recap)
                            .font(.body)
                            .lineSpacing(4)
                            .padding(20)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding(24)
            }
            .navigationTitle("Catch Me Up")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
