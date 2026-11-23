const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const sceneMarker = "// IllamHelp single-window scene for the Expo 53 app delegate.";
const windowSetup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const sceneDelegate = `
${sceneMarker}
@objc(IllamHelpSceneDelegate)
final class IllamHelpSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let scene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    var launchOptions = appDelegate.reactLaunchOptions ?? [:]
    appDelegate.reactLaunchOptions = nil
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      launchOptions[.sourceApplication] = context.options.sourceApplication
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }

    let window = UIWindow(windowScene: scene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationDidBecomeActive?(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationWillResignActive?(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationWillEnterForeground?(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    UIApplication.shared.delegate?.applicationDidEnterBackground?(UIApplication.shared)
  }

  func windowScene(
    _ windowScene: UIWindowScene,
    didUpdate previousCoordinateSpace: UICoordinateSpace,
    interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
    traitCollection previousTraitCollection: UITraitCollection
  ) {
    if #available(iOS 26.0, *) { return }
    notifyWindowFrameChanged()
  }

  @available(iOS 26.0, *)
  func windowScene(_ windowScene: UIWindowScene, didUpdateEffectiveGeometry previousGeometry: UIWindowScene.Geometry) {
    notifyWindowFrameChanged()
  }

  private func notifyWindowFrameChanged() {
    NotificationCenter.default.post(name: Notification.Name("RCTWindowFrameDidChangeNotification"),
                                    object: UIApplication.shared.delegate)
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

module.exports = function withUIKitScenes(config) {
  config = withInfoPlist(config, (result) => {
    result.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: "IllamHelp",
          UISceneDelegateClassName: "IllamHelpSceneDelegate"
        }]
      }
    };
    return result;
  });

  return withAppDelegate(config, (result) => {
    const file = result.modResults;
    const sceneStart = file.contents.indexOf(sceneMarker);
    if (sceneStart !== -1) {
      file.contents = file.contents.slice(0, sceneStart).trimEnd() + "\n" + sceneDelegate;
      return result;
    }

    const windowAnchor = "  var window: UIWindow?";
    if (file.language !== "swift" || !file.contents.includes(windowAnchor) ||
        !file.contents.includes(windowSetup)) {
      throw new Error("Review the IllamHelp UIKit scene plugin for the new AppDelegate template.");
    }
    file.contents = file.contents
      .replace(windowAnchor, windowAnchor + "\n  var reactLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?")
      .replace(windowSetup, "    reactLaunchOptions = launchOptions") + sceneDelegate;
    return result;
  });
};
