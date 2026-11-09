/* global Ultraviolet */
// Ultraviolet configuration for NOVA.
// Paths are derived from where this file is served so NOVA works both at the
// domain root and under a sub-path (e.g. GitHub Pages project sites).
(function () {
  var src =
    (typeof document !== "undefined" && document.currentScript && document.currentScript.src) ||
    self.location.href;
  var pathname = new URL(src, self.location.href).pathname;
  var match = pathname.match(/^(.*?\/uv\/)/);
  var dir = match ? match[1] : "/uv/";
  self.__uv$config = {
    prefix: dir + "service/",
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: dir + "vendor/uv.handler.js",
    client: dir + "vendor/uv.client.js",
    bundle: dir + "vendor/uv.bundle.js",
    config: dir + "uv.config.js",
    sw: dir + "vendor/uv.sw.js",
  };
})();
