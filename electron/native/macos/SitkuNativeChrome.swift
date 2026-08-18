import AppKit
import SwiftUI

private struct NativeWindowMaterial: View {
    var body: some View {
        VisualEffectView()
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }
}

private struct VisualEffectView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .underWindowBackground
        view.blendingMode = .behindWindow
        view.state = .followsWindowActiveState
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.state = .followsWindowActiveState
    }
}

private final class PassthroughHostingView<Content: View>: NSHostingView<Content> {
    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }
}

private final class NativeChromeCoordinator {
    weak var window: NSWindow?
    weak var webView: NSView?
    var materialView: NSView?

    init(webView: NSView) {
        self.webView = webView
    }

    func attach() -> Bool {
        guard let webView, let window = webView.window else { return false }
        self.window = window

        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.styleMask.insert(.fullSizeContentView)
        window.animationBehavior = .documentWindow
        window.isMovableByWindowBackground = false
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.collectionBehavior.insert(.managed)
        if #available(macOS 11.0, *) {
            window.toolbarStyle = .unifiedCompact
        }

        if materialView == nil, let parentView = webView.superview {
            let host = PassthroughHostingView(rootView: NativeWindowMaterial())
            host.frame = webView.frame
            host.autoresizingMask = [.width, .height]
            parentView.addSubview(host, positioned: .below, relativeTo: webView)
            materialView = host
        }

        return true
    }

    func detach() {
        materialView?.removeFromSuperview()
        materialView = nil
        window = nil
        webView = nil
    }

    func setAppearance(_ mode: Int32) {
        guard let window else { return }
        switch mode {
        case 1:
            window.appearance = NSAppearance(named: .darkAqua)
        case 2:
            window.appearance = NSAppearance(named: .aqua)
        default:
            window.appearance = nil
        }
    }
}

private var coordinators: [UInt: NativeChromeCoordinator] = [:]

private func nativeView(_ handle: UnsafeMutableRawPointer?) -> NSView? {
    guard let handle else { return nil }
    return Unmanaged<NSView>.fromOpaque(handle).takeUnretainedValue()
}

private func onMain<T>(_ work: () -> T) -> T {
    if Thread.isMainThread { return work() }
    return DispatchQueue.main.sync(execute: work)
}

@_cdecl("sitku_attach_native_chrome")
public func sitkuAttachNativeChrome(_ handle: UnsafeMutableRawPointer?) -> Bool {
    guard let handle, let view = nativeView(handle) else { return false }
    return onMain {
        let key = UInt(bitPattern: handle)
        let coordinator = coordinators[key] ?? NativeChromeCoordinator(webView: view)
        coordinators[key] = coordinator
        return coordinator.attach()
    }
}

@_cdecl("sitku_detach_native_chrome")
public func sitkuDetachNativeChrome(_ handle: UnsafeMutableRawPointer?) {
    guard let handle else { return }
    onMain {
        let key = UInt(bitPattern: handle)
        coordinators.removeValue(forKey: key)?.detach()
    }
}

@_cdecl("sitku_set_native_appearance")
public func sitkuSetNativeAppearance(_ handle: UnsafeMutableRawPointer?, _ mode: Int32) {
    guard let handle else { return }
    onMain {
        coordinators[UInt(bitPattern: handle)]?.setAppearance(mode)
    }
}

@_cdecl("sitku_perform_native_haptic")
public func sitkuPerformNativeHaptic(_ kind: Int32) {
    onMain {
        let pattern: NSHapticFeedbackManager.FeedbackPattern = kind == 2 ? .levelChange : .alignment
        NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
    }
}
