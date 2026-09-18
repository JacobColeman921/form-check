/**
 * The DOM typings shipped with TypeScript predate two constraints this app
 * depends on. Both are implemented in Chrome and Safari; only the types are
 * missing, so augment rather than cast at every call site.
 *
 * resizeMode: "none" forbids the browser from satisfying a size request by
 * cropping the sensor, which is what makes a webcam look zoomed in.
 * zoom is the MediaStream Image Capture zoom control.
 */
interface MediaTrackConstraintSet {
  zoom?: ConstrainDouble;
  resizeMode?: ConstrainDOMString;
}

interface MediaTrackConstraints {
  resizeMode?: ConstrainDOMString;
}

interface MediaTrackSettings {
  zoom?: number;
  resizeMode?: string;
}

interface MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
}
