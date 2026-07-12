//
//  ContentView.swift
//  Anchor (Echor)
//
//  Shows onboarding on first launch, then the home screen. Posture
//  monitoring lives in the home screen's top-right status chip.
//

import SwiftUI

struct ContentView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        if hasCompletedOnboarding {
            HomeView()
                .transition(.opacity)
        } else {
            OnboardingView()
                .transition(.opacity)
        }
    }
}

#Preview {
    ContentView()
}
