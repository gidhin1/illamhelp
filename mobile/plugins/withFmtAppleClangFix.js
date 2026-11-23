const { withPodfile } = require("expo/config-plugins");

// RN 0.79 pins fmt 11.0.2, whose FMT_STRING fails with Apple Clang 21+.
// Keep this scoped to that compiler; remove when the RN dependency is upgraded.
// https://github.com/fmtlib/fmt/issues/4740
const marker = "# IllamHelp: fmt 11 Apple Clang compatibility";
const svgMarker = "# IllamHelp: use the app minimum for the SVG filters resource bundle";
const patch = `
    ${marker}
    fmt_header = File.join(installer.sandbox.root, 'fmt/include/fmt/base.h')
    original = '#elif defined(__apple_build_version__) && __apple_build_version__ < 14000029L'
    replacement = '#elif defined(__apple_build_version__) && (__apple_build_version__ < 14000029L || __clang_major__ >= 21)'
    contents = File.read(fmt_header)
    unless contents.include?(replacement)
      raise 'Review IllamHelp fmt compatibility patch: header changed' unless contents.include?(original)
      File.chmod(0644, fmt_header)
      File.write(fmt_header, contents.sub(original, replacement))
    end
`;
const svgPatch = `
    ${svgMarker}
    svg_filters = installer.pods_project.targets.find { |target| target.name == 'RNSVG-RNSVGFilters' }
    svg_filters&.build_configurations&.each do |configuration|
      configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = podfile_properties['ios.deploymentTarget'] || '15.1'
    end
`;

module.exports = function withFmtAppleClangFix(config) {
  return withPodfile(config, (result) => {
    const anchor = "post_install do |installer|";
    const contents = result.modResults.contents;
    if (!contents.includes(anchor)) {
      throw new Error("Cannot apply iOS build compatibility patches: post_install hook missing");
    }
    const additions = (contents.includes(marker) ? "" : patch) +
      (contents.includes(svgMarker) ? "" : svgPatch);
    result.modResults.contents = contents.replace(anchor, anchor + additions);
    return result;
  });
};
