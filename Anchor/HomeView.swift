//
//  HomeView.swift
//  Anchor (Echor)
//
//  The main screen: a giant record button up top, and a dashboard of saved
//  sessions (grouped by subject, with AI recaps) below — Otter.ai style.
//

import SwiftUI

struct HomeView: View {
    @AppStorage("userName") private var userName = ""
    @StateObject private var speechManager = SpeechManager()
    @StateObject private var recapService = RecapService()
    @StateObject private var store = SessionStore()
    @StateObject private var postureMonitor = PostureMonitor()

    @State private var recordingStart: Date?
    @State private var showRecapSheet = false
    @State private var pendingTranscript = ""
    @State private var pendingDuration: TimeInterval = 0
    @State private var showSaveSheet = false
    @State private var showPostureSheet = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    recordSection
                    dashboard
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(greeting)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showPostureSheet = true
                    } label: {
                        PostureStatusChip(monitor: postureMonitor)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Posture monitor")
                }
            }
            .sheet(isPresented: $showRecapSheet) {
                RecapSheet(recapService: recapService)
            }
            .sheet(isPresented: $showPostureSheet) {
                NavigationStack {
                    PostureView(monitor: postureMonitor)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { showPostureSheet = false }
                            }
                        }
                }
            }
            .sheet(isPresented: $showSaveSheet) {
                SaveSessionSheet(duration: pendingDuration) { title, subject in
                    saveSession(title: title, subject: subject)
                }
            }
            .onChange(of: speechManager.isListening) { _, listening in
                if listening { recordingStart = Date() }
            }
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let timeOfDay = hour < 12 ? "morning" : (hour < 17 ? "afternoon" : "evening")
        let name = userName.isEmpty ? "" : ", \(userName)"
        return "Good \(timeOfDay)\(name)"
    }

    // MARK: - Record section

    private var recordSection: some View {
        VStack(spacing: 18) {
            RecordButton(isRecording: speechManager.isListening) {
                toggleRecording()
            }
            .padding(.top, 8)

            // Recording is always disclosed: this indicator is visible
            // whenever the mic is live, never hidden.
            ListeningIndicator(active: speechManager.isListening)

            if speechManager.isListening, let start = recordingStart {
                Text(timerInterval: start...Date.distantFuture, countsDown: false)
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())

                Button {
                    showRecapSheet = true
                    let transcript = speechManager.rollingTranscript()
                    Task {
                        await recapService.generateRecap(from: transcript)
                    }
                } label: {
                    Label("Catch Me Up", systemImage: "sparkles")
                        .font(.system(.headline, design: .rounded))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.glassProminent)
                .tint(.indigo)
            }

            if let error = speechManager.errorMessage {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.spring(duration: 0.35), value: speechManager.isListening)
    }

    private func toggleRecording() {
        if speechManager.isListening {
            let duration = recordingStart.map { Date().timeIntervalSince($0) } ?? 0
            speechManager.stopListening()
            recordingStart = nil

            let transcript = speechManager.sessionTranscript()
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !transcript.isEmpty else { return }
            pendingTranscript = transcript
            pendingDuration = duration
            showSaveSheet = true
        } else {
            speechManager.startListening()
        }
    }

    private func saveSession(title: String, subject: String) {
        let session = RecordingSession(
            id: UUID(),
            title: title,
            subject: subject,
            date: Date(),
            duration: pendingDuration,
            transcript: pendingTranscript,
            recap: nil,
            insights: nil
        )
        store.add(session)

        Task {
            if let insights = await recapService.summarizeSession(session.transcript) {
                store.updateInsights(id: session.id, insights: insights)
            }
        }
    }

    // MARK: - Dashboard

    @ViewBuilder
    private var dashboard: some View {
        if store.sessions.isEmpty {
            emptyState
        } else {
            statsRow
            subjectsRow
            sessionsList
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "rectangle.stack.badge.plus")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text("No sessions yet")
                .font(.system(.headline, design: .rounded))
            Text("Hit the record button in class and your sessions, recaps, and transcripts will show up here.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 24)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            StatCard(
                value: "\(store.sessions.count)",
                label: "Sessions",
                symbol: "waveform",
                tint: .indigo
            )
            StatCard(
                value: "\(Int(store.totalDuration / 60))",
                label: "Minutes",
                symbol: "clock.fill",
                tint: .orange
            )
            StatCard(
                value: "\(store.subjects.count)",
                label: "Subjects",
                symbol: "books.vertical.fill",
                tint: .teal
            )
        }
    }

    private var subjectsRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your Subjects")
                .font(.system(.title3, design: .rounded, weight: .bold))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(store.subjects, id: \.self) { subject in
                        SubjectCard(
                            subject: subject,
                            count: store.sessions(for: subject).count
                        )
                    }
                }
            }
            .scrollClipDisabled()
        }
    }

    private var sessionsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Sessions")
                .font(.system(.title3, design: .rounded, weight: .bold))

            VStack(spacing: 12) {
                ForEach(store.sessions) { session in
                    NavigationLink {
                        SessionDetailView(session: session, store: store)
                    } label: {
                        SessionRow(session: session)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Record button

private struct RecordButton: View {
    let isRecording: Bool
    let action: () -> Void
    @State private var pulsing = false

    var body: some View {
        Button(action: action) {
            ZStack {
                if isRecording {
                    Circle()
                        .stroke(Color.red.opacity(0.35), lineWidth: 3)
                        .frame(width: 190, height: 190)
                        .scaleEffect(pulsing ? 1.12 : 0.98)
                        .opacity(pulsing ? 0.2 : 0.8)
                        .animation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true), value: pulsing)
                }

                Circle()
                    .fill(
                        LinearGradient(
                            colors: isRecording ? [.red, .orange] : [.indigo, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 168, height: 168)
                    .shadow(
                        color: (isRecording ? Color.red : Color.indigo).opacity(0.45),
                        radius: 26, y: 12
                    )

                VStack(spacing: 8) {
                    Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 52, weight: .bold))
                        .contentTransition(.symbolEffect(.replace))
                    Text(isRecording ? "Stop" : "Record")
                        .font(.system(.headline, design: .rounded))
                }
                .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
        .onAppear { pulsing = true }
        .accessibilityLabel(isRecording ? "Stop recording" : "Start recording")
    }
}

// MARK: - Dashboard components

private struct StatCard: View {
    let value: String
    let label: String
    let symbol: String
    let tint: Color

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbol)
                .font(.subheadline)
                .foregroundStyle(tint)
            Text(value)
                .font(.system(.title, design: .rounded, weight: .bold))
                .contentTransition(.numericText())
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct SubjectCard: View {
    let subject: String
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "book.fill")
                .font(.title3)
                .foregroundStyle(.white.opacity(0.9))
            Spacer(minLength: 0)
            Text(subject)
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text("\(count) session\(count == 1 ? "" : "s")")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
        }
        .padding(14)
        .frame(width: 140, height: 110, alignment: .leading)
        .background(
            LinearGradient(
                colors: [subjectColor(for: subject), subjectColor(for: subject).opacity(0.7)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18)
        )
    }
}

private struct SessionRow: View {
    let session: RecordingSession

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(session.subject)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(subjectColor(for: session.subject).opacity(0.16), in: Capsule())
                    .foregroundStyle(subjectColor(for: session.subject))
                Spacer()
                Text(session.date, format: .dateTime.month(.abbreviated).day().hour().minute())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(session.title)
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(.primary)

            Text(session.insights?.overview ?? session.recap ?? session.transcript)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack(spacing: 4) {
                if let insights = session.insights {
                    Image(systemName: "sparkles")
                    Text("\(insights.keyPoints.count) key ideas")
                    if let quiz = insights.quizQuestions, !quiz.isEmpty {
                        Text("·")
                        Text("\(quiz.count) quiz Qs")
                    }
                    if !insights.actionItems.isEmpty {
                        Text("·")
                        Text("\(insights.actionItems.count) action items")
                    }
                } else {
                    Image(systemName: "text.quote")
                    Text("Transcript")
                }
                Text("·")
                Text(Duration.seconds(session.duration), format: .time(pattern: .minuteSecond))
            }
            .font(.caption)
            .foregroundStyle(.tertiary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
    }
}

// MARK: - Session detail

struct SessionDetailView: View {
    let session: RecordingSession
    @ObservedObject var store: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var isGeneratingNotes = false
    @State private var notesError: String?

    /// Live copy so the recap appears when background generation finishes.
    private var current: RecordingSession {
        store.sessions.first { $0.id == session.id } ?? session
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    Text(current.subject)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(subjectColor(for: current.subject).opacity(0.16), in: Capsule())
                        .foregroundStyle(subjectColor(for: current.subject))
                    Text(current.date, format: .dateTime.month().day().year().hour().minute())
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .foregroundStyle(.secondary)
                    Text(Duration.seconds(current.duration), format: .time(pattern: .minuteSecond))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Label("Overview", systemImage: "sparkles")
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(.indigo)
                    if let overview = current.insights?.overview ?? current.recap {
                        Text(overview)
                            .font(.body)
                            .lineSpacing(4)
                    } else if isGeneratingNotes {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Generating study notes…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        if let notesError {
                            Text(notesError)
                                .font(.subheadline)
                                .foregroundStyle(.red)
                        } else {
                            Text("No study notes yet for this session.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Button {
                            generateNotes()
                        } label: {
                            Label("Generate Study Notes", systemImage: "sparkles")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        }
                        .buttonStyle(.glassProminent)
                        .tint(.indigo)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.indigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))

                if let insights = current.insights {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Key Ideas", systemImage: "lightbulb.fill")
                            .font(.system(.headline, design: .rounded))
                            .foregroundStyle(.orange)
                        ForEach(insights.keyPoints, id: \.self) { point in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Circle()
                                    .fill(.orange)
                                    .frame(width: 6, height: 6)
                                    .padding(.top, 6)
                                Text(point)
                                    .font(.body)
                                    .lineSpacing(3)
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))

                    if let vocabulary = insights.vocabulary, !vocabulary.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Vocabulary", systemImage: "character.book.closed.fill")
                                .font(.system(.headline, design: .rounded))
                                .foregroundStyle(.purple)
                            ForEach(vocabulary, id: \.term) { entry in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.term)
                                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                                    Text(entry.definition)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .lineSpacing(2)
                                }
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
                    }

                    if let quiz = insights.quizQuestions, !quiz.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Quiz Yourself", systemImage: "questionmark.circle.fill")
                                .font(.system(.headline, design: .rounded))
                                .foregroundStyle(.blue)
                            ForEach(quiz, id: \.question) { item in
                                QuizQuestionRow(item: item)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
                    }

                    if !insights.actionItems.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Action Items", systemImage: "checklist")
                                .font(.system(.headline, design: .rounded))
                                .foregroundStyle(.green)
                            ForEach(insights.actionItems, id: \.self) { item in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Image(systemName: "checkmark.circle")
                                        .font(.subheadline)
                                        .foregroundStyle(.green)
                                    Text(item)
                                        .font(.body)
                                        .lineSpacing(3)
                                }
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Label("Transcript", systemImage: "text.quote")
                        .font(.system(.headline, design: .rounded))
                    Text(current.transcript)
                        .font(.body)
                        .lineSpacing(4)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(current.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .destructiveAction) {
                Button(role: .destructive) {
                    store.delete(session)
                    dismiss()
                } label: {
                    Image(systemName: "trash")
                }
            }
        }
    }

    private func generateNotes() {
        isGeneratingNotes = true
        notesError = nil
        Task {
            do {
                let insights = try await OllamaService.insights(for: current.transcript)
                store.updateInsights(id: session.id, insights: insights)
            } catch {
                notesError = error.localizedDescription
            }
            isGeneratingNotes = false
        }
    }
}

/// One practice question with a tap-to-reveal answer.
private struct QuizQuestionRow: View {
    let item: QuizItem
    @State private var showAnswer = false

    var body: some View {
        Button {
            withAnimation(.spring(duration: 0.3)) {
                showAnswer.toggle()
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.question)
                        .font(.subheadline.weight(.medium))
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Image(systemName: showAnswer ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if showAnswer {
                    Text(item.answer)
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                        .multilineTextAlignment(.leading)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                } else {
                    Text("Tap to reveal answer")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}

// MARK: - Posture status chip

/// Live posture readout pinned to the top-right of the home screen. Gray
/// when the camera is off; green/yellow/red while monitoring. Tapping opens
/// the full posture sheet.
private struct PostureStatusChip: View {
    @ObservedObject var monitor: PostureMonitor

    private var statusColor: Color {
        guard monitor.isRunning else { return .gray }
        guard monitor.baseline != nil else { return .gray }
        switch monitor.status {
        case .good: return .green
        case .warning: return .yellow
        case .bad: return .red
        }
    }

    private var statusLabel: String {
        guard monitor.isRunning else { return "Posture" }
        guard monitor.baseline != nil else { return "Calibrating" }
        switch monitor.status {
        case .good: return "Good posture"
        case .warning: return "Drifting"
        case .bad: return "Bad posture"
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "figure.seated.side")
                .font(.footnote)
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusLabel)
                .font(.footnote.weight(.semibold))
        }
        .foregroundStyle(monitor.isRunning ? .primary : .secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .glassEffect(.regular.interactive())
        .animation(.easeInOut(duration: 0.25), value: statusColor)
    }
}

// MARK: - Save sheet

private struct SaveSessionSheet: View {
    let duration: TimeInterval
    let onSave: (String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var subject = "General"
    @State private var customSubject = ""

    private static let suggestions = [
        "General", "Math", "Science", "History", "English", "Computer Science"
    ]

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Title")
                        .font(.system(.headline, design: .rounded))
                    TextField("e.g. Photosynthesis lecture", text: $title)
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Subject")
                        .font(.system(.headline, design: .rounded))
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], spacing: 10) {
                        ForEach(Self.suggestions, id: \.self) { suggestion in
                            Button {
                                subject = suggestion
                                customSubject = ""
                            } label: {
                                Text(suggestion)
                                    .font(.subheadline.weight(.medium))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(
                                        subject == suggestion
                                            ? subjectColor(for: suggestion).opacity(0.2)
                                            : Color(.secondarySystemGroupedBackground),
                                        in: Capsule()
                                    )
                                    .foregroundStyle(
                                        subject == suggestion
                                            ? subjectColor(for: suggestion)
                                            : .primary
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    TextField("Or type your own", text: $customSubject)
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                }

                Label {
                    Text(Duration.seconds(duration), format: .time(pattern: .minuteSecond))
                } icon: {
                    Image(systemName: "clock")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)

                Spacer()
            }
            .padding(20)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Save Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Discard", role: .destructive) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let chosenSubject = customSubject.trimmingCharacters(in: .whitespacesAndNewlines)
                        let finalSubject = chosenSubject.isEmpty ? subject : chosenSubject
                        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
                        let finalTitle = trimmedTitle.isEmpty
                            ? "\(finalSubject) — \(Date().formatted(date: .abbreviated, time: .shortened))"
                            : trimmedTitle
                        onSave(finalTitle, finalSubject)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled()
    }
}

#Preview {
    HomeView()
}
