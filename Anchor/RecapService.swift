//
//  RecapService.swift
//  Anchor (Echor)
//
//  Generates recaps and structured session notes using a local Ollama
//  server. Nothing is sent to the cloud — the model runs on localhost.
//

import Combine
import Foundation

@MainActor
final class RecapService: ObservableObject {
    @Published var recap: String?
    @Published private(set) var isGenerating = false
    @Published var errorMessage: String?

    /// "Catch Me Up": quick bullet points about the last few minutes.
    func generateRecap(from transcript: String) async {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            errorMessage = "Nothing transcribed yet — start listening and give it a moment."
            return
        }

        isGenerating = true
        errorMessage = nil
        recap = nil
        defer { isGenerating = false }

        do {
            recap = try await OllamaService.chat(
                system: """
                    You help a student who briefly lost focus in class catch up. \
                    Given the last few minutes of an auto-generated lecture transcript \
                    (which may contain transcription errors), reply with 3 to 5 short \
                    bullet points, each on its own line starting with "• ", covering \
                    the key ideas, definitions, and anything the teacher said to \
                    remember or do. No preamble.
                    """,
                user: "Transcript of the last few minutes of class:\n\n\(text)\n\nCatch me up."
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Structured Otter-style notes for a full recorded session. Returns nil
    /// if Ollama is unreachable or generation fails — the session is still
    /// saved with its transcript either way.
    func summarizeSession(_ transcript: String) async -> SessionInsights? {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        return try? await OllamaService.insights(for: text)
    }
}
