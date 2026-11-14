import { asset } from "../lib/api";
import * as THREE from "three";

const surfaceVertex = `
 varying vec2 vUv;
 varying vec3 vWorldNormal;
 varying vec3 vWorldPosition;
 void main(){
  vUv=uv;
  vWorldNormal=normalize(mat3(modelMatrix)*normal);
  vec4 worldPosition=modelMatrix*vec4(position,1.0);
  vWorldPosition=worldPosition.xyz;
  gl_Position=projectionMatrix*viewMatrix*worldPosition;
 }
`;

export function texturePath(id) {
  if (id === "earth") return asset("/assets/textures/earth-day.webp");
  if (id === "sun") return asset("/assets/textures/sun.webp");
  return asset("/assets/textures/") + id + ".jpg";
}

export function createMapLoader(loader, renderer) {
  return (path, color = true) => {
    const texture = loader.load(path);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(
      16,
      renderer?.capabilities.getMaxAnisotropy() || 1,
    );
    return texture;
  };
}

export function createAtmosphere(
  radius,
  color,
  strength = 0.45,
  sunlit = true,
) {
  const material = new THREE.ShaderMaterial({
    vertexShader: surfaceVertex,
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      strength: { value: strength },
      sunlit: { value: sunlit ? 1 : 0 },
    },
    fragmentShader: `
   uniform vec3 glowColor;
   uniform float strength;
   uniform float sunlit;
   varying vec3 vWorldNormal;
   varying vec3 vWorldPosition;
   void main(){
    vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
    float rim=pow(1.0-abs(dot(normalize(vWorldNormal),viewDirection)),3.8);
    vec3 sunDirection=normalize(-vWorldPosition);
    float daylight=smoothstep(-0.35,0.5,dot(normalize(vWorldNormal),sunDirection));
    gl_FragColor=vec4(glowColor,rim*strength*mix(1.0,0.18+0.82*daylight,sunlit));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }
  `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), material);
}

export function createEarth(radius, loadMap) {
  const material = new THREE.ShaderMaterial({
    vertexShader: surfaceVertex,
    uniforms: {
      dayMap: { value: loadMap(texturePath("earth")) },
      nightMap: { value: loadMap(asset("/assets/textures/earth-night.webp")) },
    },
    fragmentShader: `
   uniform sampler2D dayMap;
   uniform sampler2D nightMap;
   varying vec2 vUv;
   varying vec3 vWorldNormal;
   varying vec3 vWorldPosition;
   void main(){
    vec3 normal=normalize(vWorldNormal);
    vec3 sunDirection=normalize(-vWorldPosition);
    vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
    float sunlight=dot(normal,sunDirection);
    float dayBlend=smoothstep(-0.12,0.17,sunlight);
    vec3 day=texture2D(dayMap,vUv).rgb;
    vec3 night=texture2D(nightMap,vUv).rgb;
    vec3 color=day*(0.025+max(sunlight,0.0)*1.2);
    color+=night*(1.0-dayBlend)*1.65;
    float ocean=smoothstep(0.015,0.10,day.b-max(day.r,day.g)*0.8);
    vec3 reflection=reflect(-sunDirection,normal);
    float glint=pow(max(dot(reflection,viewDirection),0.0),65.0)*ocean*dayBlend;
    color+=vec3(0.85,0.94,1.0)*glint*0.65;
    float rim=pow(1.0-max(dot(normal,viewDirection),0.0),4.0);
    color+=vec3(0.04,0.22,0.48)*rim*dayBlend*0.5;
    gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }
  `,
  });
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.007, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      uniforms: {
        cloudMap: {
          value: loadMap(asset("/assets/textures/earth-clouds.webp"), false),
        },
      },
      fragmentShader: `
   uniform sampler2D cloudMap;
   varying vec2 vUv;
   varying vec3 vWorldNormal;
   varying vec3 vWorldPosition;
   void main(){
    float cloud=texture2D(cloudMap,vUv).a;
    float light=max(dot(normalize(vWorldNormal),normalize(-vWorldPosition)),0.0);
    gl_FragColor=vec4(vec3(0.7,0.82,1.0)*(0.06+light),pow(cloud,1.25)*0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }
  `,
      transparent: true,
      depthWrite: false,
    }),
  );
  return {
    material,
    clouds,
    atmosphere: createAtmosphere(radius * 1.045, 0x409eff, 0.7),
  };
}

export function createSun(radius, loadMap) {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    vertexShader: surfaceVertex,
    uniforms: {
      surfaceMap: { value: loadMap(texturePath("sun")) },
      time: { value: 0 },
    },
    fragmentShader: `
   uniform sampler2D surfaceMap;
   uniform float time;
   varying vec2 vUv;
   varying vec3 vWorldNormal;
   varying vec3 vWorldPosition;
   void main(){
    vec2 uv=vUv;
    uv.x+=sin(uv.y*42.0+time*0.22)*0.0018;
    uv.y+=sin(uv.x*38.0-time*0.15)*0.0012;
    vec3 surface=texture2D(surfaceMap,uv).rgb;
    float facing=max(dot(normalize(vWorldNormal),normalize(cameraPosition-vWorldPosition)),0.0);
    float pulse=1.0+sin(time*0.45+vUv.y*24.0)*0.025;
    vec3 color=surface*1.55*(0.72+0.28*sqrt(facing))*pulse;
    gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }
  `,
  });
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 96),
    material,
  );
  group.add(surface);
  // A soft, depth-tested corona surrounds the emissive surface.
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const glow = context.createRadialGradient(128, 128, 22, 128, 128, 128);
  glow.addColorStop(0, "rgba(255,209,117,0.55)");
  glow.addColorStop(0.26, "rgba(255,149,44,0.3)");
  glow.addColorStop(0.48, "rgba(255,91,20,0.11)");
  glow.addColorStop(1, "rgba(255,70,10,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 256, 256);
  const coronaTexture = new THREE.CanvasTexture(canvas);
  coronaTexture.colorSpace = THREE.SRGBColorSpace;
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coronaTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  corona.scale.setScalar(radius * 8);
  group.add(corona);
  const limb = createAtmosphere(radius * 1.12, 0xff7c27, 0.75, false);
  group.add(limb);
  return { group, surface, material, corona };
}
