/*
 * AprilTag 36h11 detector running off the UI thread (spec 19.1: Web Worker).
 * Frames arrive as RGBA pixel buffers and are analysed locally; nothing is stored or uploaded.
 * Detector: js-aruco2 (MIT) with the official tag36h11 dictionary (BSD, APRIL Robotics Lab).
 * The detector is isolated behind this message protocol so a WASM AprilTag build can replace it.
 */
/* eslint-disable no-undef */
self.importScripts('/vendor/js-aruco2/cv.js', '/vendor/js-aruco2/aruco.js', '/vendor/js-aruco2/apriltag_36h11.js');

var detector = new AR.Detector({ dictionaryName: 'APRILTAG_36h11', maxHammingDistance: 4 });

self.onmessage = function (event) {
  var msg = event.data;
  if (!msg || msg.type !== 'frame') return;
  var started = Date.now();
  var markers = [];
  try {
    var found = detector.detect({ width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) });
    for (var i = 0; i < found.length; i++) {
      markers.push({ id: found[i].id, hammingDistance: found[i].hammingDistance, corners: found[i].corners });
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e && e.message ? e.message : e) });
    return;
  }
  self.postMessage({ type: 'result', frameId: msg.frameId, markers: markers, ms: Date.now() - started, buffer: msg.buffer }, [msg.buffer]);
};
self.postMessage({ type: 'ready' });
