//
//  OllamaService.swift
//  Anchor (Echor)
//
//  Talks to a local Ollama server (http://localhost:11434) for all AI
//  features. Override the host or model via UserDefaults keys
//  "ollamaBaseURL" / "ollamaModel" — e.g. point at your Mac's LAN IP when
//  running on a physical device.
//

import Foundation

enum OllamaService {
    static var baseURL: String {
        UserDefaults.standard.string(forKey: "ollamaBaseURL") ?? "http://localhost:11434"
    }

    static var model: String {
        UserDefaults.standard.string(forKey: "ollamaModel") ?? "llama3.2"
    }

    enum OllamaError: LocalizedError {
        case invalidURL
        case cannotConnect
        case requestFailed(Int)
        case emptyResponse

        var errorDescription: String? {
            switch self {
            case .invalidURL:
                "The Ollama server URL is invalid."
            case .cannotConnect:
                "Couldn't reach Ollama at \(OllamaService.baseURL). Make sure Ollama is running on this machine."
            case .requestFailed(let code):
                "Ollama returned an error (HTTP \(code)). Is the model pulled? Try `ollama pull \(OllamaService.model)`."
            case .emptyResponse:
                "Ollama returned an empty response."
            }
        }
    }

    /// One non-streaming chat completion. Pass a JSON schema to constrain
    /// the reply to structured JSON (Ollama's `format` parameter).
    static func chat(system: String, user: String, schema: [String: Any]? = nil) async throws -> String {
        guard let url = URL(string: baseURL)?.appending(path: "api/chat") else {
            throw OllamaError.invalidURL
        }

        var body: [String: Any] = [
            "model": model,
            "stream": false,
            "messages": [
                ["role": "system", "content": system],
                ["role": "user", "content": user],
            ],
            "options": ["temperature": 0.3],
        ]
        if let schema {
            body["format"] = schema
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        // Local models can be slow to answer, especially on first load.
        request.timeoutInterval = 180

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw OllamaError.cannotConnect
        }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw OllamaError.requestFailed((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        struct ChatResponse: Decodable {
            struct Message: Decodable {
                let content: String
            }
            let message: Message
        }
        let content = (try? JSONDecoder().decode(ChatResponse.self, from: data))?
            .message.content
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !content.isEmpty else { throw OllamaError.emptyResponse }
        return content
    }

    /// Otter-style structured notes: overview, key ideas, and action items,
    /// enforced with a JSON schema so the reply always decodes.
    static func insights(for transcript: String) async throws -> SessionInsights {
        let schema: [String: Any] = [
            "type": "object",
            "properties": [
                "overview": ["type": "string"],
                "keyPoints": ["type": "array", "items": ["type": "string"]],
                "actionItems": ["type": "array", "items": ["type": "string"]],
            ],
            "required": ["overview", "keyPoints", "actionItems"],
        ]

        let content = try await chat(
            system: """
                You turn class lecture transcripts into structured study notes. \
                The transcript is auto-generated and may contain transcription errors. \
                Respond in JSON with: "overview" (a 2-3 sentence summary of the session), \
                "keyPoints" (4-8 short bullet points covering the key ideas, definitions, \
                and concepts), and "actionItems" (homework, readings, exam dates, or \
                things the teacher said to do — an empty array if there are none).
                """,
            user: "Transcript:\n\n\(transcript)",
            schema: schema
        )

        guard let data = content.data(using: .utf8) else {
            throw OllamaError.emptyResponse
        }
        return try JSONDecoder().decode(SessionInsights.self, from: data)
    }
}
