import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createOrbitalScene } from "../scene/orbital.js";
import { texturePath } from "../scene/celestial.js";
import { useLang } from "../i18n/LanguageContext.jsx";
const SpaceScene = forwardRef(function SpaceScene(
  {
    world,
    worldIndex,
    siteIndex,
    markers,
    paused,
    speed,
    cinematic,
    onWorld,
    onPlace,
    onHover,
  },
  ref,
) {
  const { tr } = useLang();
  const canvas = useRef(null),
    engine = useRef(null),
    callbacks = useRef({ onWorld, onPlace, onHover });
  callbacks.current = { onWorld, onPlace, onHover };
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(tr("Завантаження текстур…")),
    [labels, setLabels] = useState([]);
  useImperativeHandle(
    ref,
    () => ({
      overview: () => engine.current?.overview(),
      zoom: (direction) => engine.current?.zoom(direction),
    }),
    [],
  );
  useEffect(() => {
    let active = true;
    engine.current = createOrbitalScene(canvas.current, {
      onSelectWorld: (index) => callbacks.current.onWorld(index),
      onSelectPlace: (index) => callbacks.current.onPlace(index),
      onHover: (value) => callbacks.current.onHover(value),
      onError: (message) => {
        if (active) setError(message);
      },
      onLoad: (message) => {
        if (active) setLoading(message);
      },
      onLabels: (value) => {
        if (active) setLabels(value);
      },
    });
    return () => {
      active = false;
      engine.current?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.selectWorld(worldIndex);
  }, [worldIndex]);
  useEffect(() => {
    engine.current?.focusPlace(siteIndex);
  }, [siteIndex, worldIndex]);
  useEffect(() => {
    engine.current?.setMarkers(markers);
  }, [markers]);
  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);
  useEffect(() => {
    engine.current?.setSpeed(Number(speed));
  }, [speed]);
  useEffect(() => {
    engine.current?.setCinematic(cinematic);
  }, [cinematic]);
  return (
    <>
      {error && (
        <div
          id="surfacePreview"
          className={world.id === "sun" ? "solar" : ""}
          style={{ backgroundImage: `url('${texturePath(world.id)}')` }}
        />
      )}
      <canvas
        id="space"
        ref={canvas}
        aria-label={tr("Інтерактивна 3D-система. Натисни на планету або мітку локації.")}
        style={error ? { opacity: 0 } : undefined}
      />
      {!error && (
        <div id="planetLabels">
          {labels.map((label) => (
            <button
              className="planet-label"
              key={label.index}
              style={{ left: label.x, top: label.y }}
              onClick={() => onWorld(label.index)}
            >
              {tr(label.name)} →
            </button>
          ))}
        </div>
      )}
      <div className="texture-status" role="status">
        {error ? tr("Фотокарта поверхні") : tr(loading)}
      </div>
      {error && (
        <div id="sceneError" className="scene-error">
          {error}
        </div>
      )}
    </>
  );
});
export default SpaceScene;
