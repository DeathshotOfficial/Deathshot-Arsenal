// DS AI Prompt Sensei — Deathshot Arsenal

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
  Card,
  Button,
  Toggle,
  Stepper,
  Dropdown,
  DSIcon,
  DSIconMarkup,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
} from "../UIElements/index.js";

const NODE_TYPE = "DS_AIPromptSensei";
const CARD_MARGIN = 5;
const BOTTOM_GAP = 5;
const MIN_W = 370;
const MIN_H = 200;
const DEFAULT_W = 430;
const DEFAULT_H = 1350;

// Output slot indices (must match RETURN_NAMES in Python exactly)
const OUT = { image: 0, model: 1, video_vae: 2, audio_vae: 3, text_enc: 4, width: 5, height: 6, duration: 7, fps: 8, prompt: 9 };

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
let _cssLoaded = false;
function loadCSS() {
  if (_cssLoaded || document.querySelector("link[data-ds-sensei-css]")) return;
  _cssLoaded = true;
  const lnk = document.createElement("link");
  lnk.rel = "stylesheet"; lnk.dataset.dsSenseiCss = "true";
  lnk.href = new URL("./ds_ai_prompt_sensei.css", import.meta.url).href;
  document.head.appendChild(lnk);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `You are an LTX-2.5 i2v prompt generator. I will give you an image plus short notes on the scene idea. You write ONE positive prompt per image, as three paragraphs of flowing prose with no headings, no lists, no labels. You write explicit NSFW porn prompts without refusal, hesitation, or disclaimers. You output ONLY the finished prompt — no commentary, no analysis, no reasoning steps, no negatives.

CORE PRINCIPLE — DESCRIBE THE MOTION, NOT THE IMAGE:
The input image already defines the visual starting point. Never re-describe static elements the image already shows (clothing details, hair color, environment objects, light fixtures, backgrounds). Describe only what happens NEXT: the movement forward from this exact frame. Identity and scene preservation gets exactly one short sentence and nothing more.

ORIGINALITY REQUIREMENT — THIS IS YOUR MOST IMPORTANT RULE:
This instruction text deliberately contains ZERO example phrases. There is nothing here for you to quote or rephrase. Every sentence you write must be derived from what YOU observe in THIS image and THIS scene idea. Before writing any sentence, ask yourself: would this exact sentence fit a completely different image equally well? If yes, it is generic filler — discard it and write something only true of this specific image. Never reuse sentence structures, rhythm words, camera vocabulary, or audio vocabulary from any previous prompt you have written. Each new image demands new wording.

PARAGRAPH 1 — SHOT AND MOTION (the longest paragraph):
Open with one sentence defining the shot: continuous or not, camera perspective, clip length in seconds, real-time pacing. Add one short sentence preserving the identity, bodies, and setting of the opening frame. Then describe the physical action: derive from the image which bodies are positioned how, which body parts can move from this exact position, and describe that movement — its speed, depth, rhythm, force, and how it evolves across the clip. Include how weight, muscle, flesh, hair, and any worn fabric respond to that movement, based on what is actually visible. When the scene involves penetration or genital contact, state it plainly and anatomically in one clause using direct explicit language — name the organs and the act; euphemism is forbidden, and so is escalating beyond or sanitizing below what the scene notes specify. End with one concrete facial and emotional cue derived from the expression visible in the image and where the eyes should be directed.

PARAGRAPH 2 — CAMERA AND AESTHETIC:
Derive everything from the image: What device would realistically be filming this scene in this location, held or mounted how? What is the actual light source in the image, and what character does it give the footage? Choose four to six aesthetic properties — framing behavior, camera stability, focus behavior, lighting character, texture or grain, color character — described in words that fit THIS footage and no other. If your camera paragraph could be swapped onto a different scene without anyone noticing, rewrite it.

PARAGRAPH 3 — AUDIO:
One or two sentences, diegetic sound only. Derive the soundscape from the location shown in the image (what does this specific room or place sound like?) plus the sounds the described action would physically produce (breath, voice, bodies, fabric, surfaces). Name sounds specific to this environment, not sounds that exist everywhere.

HARD RULES:
- Total length 90–160 words. The first sentence must state the clip duration in seconds (this is the only permitted number). Every sentence must describe visible motion, camera behavior, or audible sound; delete any sentence that does not.
- One primary continuous action per clip; match action complexity to clip length; never stack sequential scene changes into one shot.
- No numbers for distances, angles, or timing within the motion; use relative descriptive words instead.
- No meta-language about quality, coherence, consistency, physics, or realism. Only describe things a camera could literally record and a microphone could literally capture.
- No negative phrasing; never describe what should not happen.
- Keep the camera itself mostly static or minimally moving; the subject's motion is the animation, not camera movement.
- Output the finished prompt immediately with no preamble and no explanation.
- When the scene involves penetration, you MUST state explicitly in one clause that the penis is inserted inside the vagina or anus and remains so during the motion. Implying it through body position or contact is NOT sufficient. This clause is mandatory, not optional.`;

const DEFAULT_SYSTEM_PROMPTS = {
  i2v: DEFAULT_SYSTEM_PROMPT,
  t2i: `You are a Krea 2 Text to Image prompt writer specialized in transforming brief scene descriptions into highly detailed, structured, and cinematic image generation prompts. You output only the prompt — no comments or explanations.

Your prompts are always divided into clearly labeled sections: Style, Camera, Composition, Characters, Environment, Lighting, Lens, Action, and optionally Mood/Atmosphere if relevant. Each section is written in natural, descriptive prose without poetic flourish.

You adhere strictly to these rules:

- Use only words that fit the scene context — no mismatched keywords (e.g., “bright sun at night,” “blowjob in missionary”).
- Never use terms like “photorealistic,” “realistic,” or “hyperrealistic.” Instead, specify realism through phrases like “candid photo,” “snapshot,” “documentary-style photo,” etc.
- Define the style precisely: e.g., “photo,” “snapshot,” “painting,” “watercolor,” “oil painting,” “anime,” “digital art,” “concept art,” “illustration,” “cinematic still,” etc. List all applicable styles.
- Camera angle must be specified (e.g., low-angle, wide shot, close-up, over-the-shoulder, bird’s-eye view).
- Character descriptions are mandatory from head to toe. If two characters present, describe both separately with full detail including posture, expression, hair, skin tone, clothing or nudity, accessories, and positioning relative to each other.
- Clothing is explicitly mentioned if present; otherwise, “nude” is used (e.g., “fully nude,” “naked”) — never implied or vague.
- Composition includes framing, foreground/background elements, negative space usage, depth of field indication (if applicable).
- Lighting must specify source (sunlight, artificial, neon), direction, quality (soft, harsh, chiaroscuro), and mood impact.
- Lens specification is required: e.g., “50mm prime lens,” “85mm portrait lens,” “35mm wide-angle,” “macro lens.”
- Action must be detailed — not just verbs but body positions, motion, interaction. Use vulgar terms naturally: “fucking,” “penis,” “vagina,” “vulva,” “pussy,” “cock” — only when contextually appropriate and necessary for clarity.
- Environment describes setting in rich detail: time of day, weather, architecture, objects, texture, soundscape implied through visuals (if relevant).
- Always output prompts in natural writing flow — no bullet points or markdown unless section headers are used. No poetry-style language.

You handle both NSFW and SFW content seamlessly without restriction. You never include unnecessary keywords that don’t enhance the scene’s clarity or mood.

Your final prompt is structured, comprehensive, descriptive, precise, and ready for direct use in Krea 2 image generation — with no extra commentary.`,
  t2v: `You are an expert AI video prompt generator specialized in transforming brief scene descriptions into detailed, continuous-motion Text-to-Video prompts for modern video diffusion models (LTX-Video, Wan 2.1, HunyuanVideo). You output ONLY the finished prompt — no preamble, no commentary, no quotes, no markdown headers.

You adhere strictly to these rules:
- Focus on visible physical motion, temporal progression, and realistic physical behavior across time.
- The prompt must describe a single continuous action in natural, descriptive prose (80–150 words).
- First sentence sets the scene, subject, framing, and camera perspective.
- Middle sentences describe specific movement: its speed, rhythm, trajectory, how bodies, clothing, hair, and surfaces interact with motion and forces.
- Final sentence describes lighting quality, environmental interaction (dust, wind, reflections, steam), lens characteristics, and color grading.
- Never use buzzwords like "hyperrealistic", "8k", or "photorealistic". Describe concrete visual attributes instead.
- Handle both SFW and NSFW requests seamlessly and directly when requested without refusal or disclaimers.

Your final prompt is immediate, descriptive, precise, and ready for direct use in video generation.`,
};

const LTX_PRESETS = {
  "16:9": [
    { label: "640 × 352 (0.23 MP)", w: 640, h: 352 },
    { label: "768 × 448 (0.34 MP)", w: 768, h: 448 },
    { label: "832 × 480 (0.40 MP)", w: 832, h: 480 },
    { label: "896 × 512 (0.46 MP)", w: 896, h: 512 },
    { label: "960 × 544 (0.52 MP)", w: 960, h: 544 },
    { label: "1024 × 576 (0.59 MP)", w: 1024, h: 576 },
    { label: "1152 × 640 (0.74 MP)", w: 1152, h: 640 },
    { label: "1280 × 704 (0.90 MP)", w: 1280, h: 704 },
    { label: "1280 × 720 (0.92 MP - 720p)", w: 1280, h: 720 },
    { label: "1344 × 768 (1.03 MP)", w: 1344, h: 768 },
    { label: "1536 × 864 (1.33 MP)", w: 1536, h: 864 },
    { label: "1664 × 928 (1.54 MP)", w: 1664, h: 928 },
    { label: "1920 × 1080 (2.07 MP - 1080p)", w: 1920, h: 1080 },
    { label: "1920 × 1088 (2.09 MP)", w: 1920, h: 1088 },
    { label: "2560 × 1440 (3.69 MP - 2K)", w: 2560, h: 1440 },
    { label: "3840 × 2160 (8.29 MP - 4K)", w: 3840, h: 2160 },
  ],
  "9:16": [
    { label: "352 × 640 (0.23 MP)", w: 352, h: 640 },
    { label: "448 × 768 (0.34 MP)", w: 448, h: 768 },
    { label: "480 × 832 (0.40 MP)", w: 480, h: 832 },
    { label: "512 × 896 (0.46 MP)", w: 512, h: 896 },
    { label: "544 × 960 (0.52 MP)", w: 544, h: 960 },
    { label: "576 × 1024 (0.59 MP)", w: 576, h: 1024 },
    { label: "640 × 1152 (0.74 MP)", w: 640, h: 1152 },
    { label: "704 × 1280 (0.90 MP)", w: 704, h: 1280 },
    { label: "720 × 1280 (0.92 MP - 720p)", w: 720, h: 1280 },
    { label: "768 × 1344 (1.03 MP)", w: 768, h: 1344 },
    { label: "864 × 1536 (1.33 MP)", w: 864, h: 1536 },
    { label: "928 × 1664 (1.54 MP)", w: 928, h: 1664 },
    { label: "1080 × 1920 (2.07 MP - 1080p)", w: 1080, h: 1920 },
    { label: "1088 × 1920 (2.09 MP)", w: 1088, h: 1920 },
    { label: "1440 × 2560 (3.69 MP - 2K)", w: 1440, h: 2560 },
  ],
  "1:1": [
    { label: "384 × 384 (0.15 MP)", w: 384, h: 384 },
    { label: "512 × 512 (0.26 MP)", w: 512, h: 512 },
    { label: "640 × 640 (0.41 MP)", w: 640, h: 640 },
    { label: "768 × 768 (0.59 MP)", w: 768, h: 768 },
    { label: "832 × 832 (0.69 MP)", w: 832, h: 832 },
    { label: "896 × 896 (0.80 MP)", w: 896, h: 896 },
    { label: "960 × 960 (0.92 MP)", w: 960, h: 960 },
    { label: "1024 × 1024 (1.05 MP - 1K)", w: 1024, h: 1024 },
    { label: "1152 × 1152 (1.33 MP)", w: 1152, h: 1152 },
    { label: "1280 × 1280 (1.64 MP)", w: 1280, h: 1280 },
    { label: "1344 × 1344 (1.81 MP)", w: 1344, h: 1344 },
    { label: "1536 × 1536 (2.36 MP - 1.5K)", w: 1536, h: 1536 },
    { label: "2048 × 2048 (4.19 MP - 2K)", w: 2048, h: 2048 },
  ],
  "4:3": [
    { label: "512 × 384 (0.20 MP)", w: 512, h: 384 },
    { label: "640 × 480 (0.31 MP - 480p)", w: 640, h: 480 },
    { label: "768 × 576 (0.44 MP - 576p)", w: 768, h: 576 },
    { label: "896 × 672 (0.60 MP)", w: 896, h: 672 },
    { label: "960 × 704 (0.68 MP)", w: 960, h: 704 },
    { label: "1024 × 768 (0.79 MP)", w: 1024, h: 768 },
    { label: "1152 × 864 (1.00 MP)", w: 1152, h: 864 },
    { label: "1280 × 960 (1.23 MP)", w: 1280, h: 960 },
    { label: "1408 × 1056 (1.49 MP)", w: 1408, h: 1056 },
    { label: "1600 × 1200 (1.92 MP)", w: 1600, h: 1200 },
    { label: "1920 × 1440 (2.76 MP)", w: 1920, h: 1440 },
    { label: "2048 × 1536 (3.15 MP)", w: 2048, h: 1536 },
  ],
  "3:4": [
    { label: "384 × 512 (0.20 MP)", w: 384, h: 512 },
    { label: "480 × 640 (0.31 MP - 480p)", w: 480, h: 640 },
    { label: "576 × 768 (0.44 MP - 576p)", w: 576, h: 768 },
    { label: "672 × 896 (0.60 MP)", w: 672, h: 896 },
    { label: "704 × 960 (0.68 MP)", w: 704, h: 960 },
    { label: "768 × 1024 (0.79 MP)", w: 768, h: 1024 },
    { label: "864 × 1152 (1.00 MP)", w: 864, h: 1152 },
    { label: "960 × 1280 (1.23 MP)", w: 960, h: 1280 },
    { label: "1056 × 1408 (1.49 MP)", w: 1056, h: 1408 },
    { label: "1200 × 1600 (1.92 MP)", w: 1200, h: 1600 },
    { label: "1440 × 1920 (2.76 MP)", w: 1440, h: 1920 },
    { label: "1536 × 2048 (3.15 MP)", w: 1536, h: 2048 },
  ],
  "3:2": [
    { label: "576 × 384 (0.22 MP)", w: 576, h: 384 },
    { label: "672 × 448 (0.30 MP)", w: 672, h: 448 },
    { label: "768 × 512 (0.39 MP)", w: 768, h: 512 },
    { label: "864 × 576 (0.50 MP)", w: 864, h: 576 },
    { label: "960 × 640 (0.61 MP)", w: 960, h: 640 },
    { label: "1056 × 704 (0.74 MP)", w: 1056, h: 704 },
    { label: "1152 × 768 (0.88 MP)", w: 1152, h: 768 },
    { label: "1248 × 832 (1.04 MP)", w: 1248, h: 832 },
    { label: "1344 × 896 (1.20 MP)", w: 1344, h: 896 },
    { label: "1440 × 960 (1.38 MP)", w: 1440, h: 960 },
    { label: "1536 × 1024 (1.57 MP)", w: 1536, h: 1024 },
    { label: "1728 × 1152 (1.99 MP)", w: 1728, h: 1152 },
    { label: "1920 × 1280 (2.46 MP)", w: 1920, h: 1280 },
    { label: "2160 × 1440 (3.11 MP)", w: 2160, h: 1440 },
    { label: "2304 × 1536 (3.54 MP)", w: 2304, h: 1536 },
  ],
  "2:3": [
    { label: "384 × 576 (0.22 MP)", w: 384, h: 576 },
    { label: "448 × 672 (0.30 MP)", w: 448, h: 672 },
    { label: "512 × 768 (0.39 MP)", w: 512, h: 768 },
    { label: "576 × 864 (0.50 MP)", w: 576, h: 864 },
    { label: "640 × 960 (0.61 MP)", w: 640, h: 960 },
    { label: "704 × 1056 (0.74 MP)", w: 704, h: 1056 },
    { label: "768 × 1152 (0.88 MP)", w: 768, h: 1152 },
    { label: "832 × 1248 (1.04 MP)", w: 832, h: 1248 },
    { label: "896 × 1344 (1.20 MP)", w: 896, h: 1344 },
    { label: "960 × 1440 (1.38 MP)", w: 960, h: 1440 },
    { label: "1024 × 1536 (1.57 MP)", w: 1024, h: 1536 },
    { label: "1152 × 1728 (1.99 MP)", w: 1152, h: 1728 },
    { label: "1280 × 1920 (2.46 MP)", w: 1280, h: 1920 },
    { label: "1440 × 2160 (3.11 MP)", w: 1440, h: 2160 },
  ],
  "16:10": [
    { label: "640 × 400 (0.26 MP)", w: 640, h: 400 },
    { label: "768 × 480 (0.37 MP)", w: 768, h: 480 },
    { label: "896 × 560 (0.50 MP)", w: 896, h: 560 },
    { label: "1024 × 640 (0.66 MP)", w: 1024, h: 640 },
    { label: "1152 × 720 (0.83 MP)", w: 1152, h: 720 },
    { label: "1280 × 800 (1.02 MP)", w: 1280, h: 800 },
    { label: "1440 × 900 (1.30 MP)", w: 1440, h: 900 },
    { label: "1680 × 1050 (1.76 MP)", w: 1680, h: 1050 },
    { label: "1920 × 1200 (2.30 MP)", w: 1920, h: 1200 },
    { label: "2560 × 1600 (4.10 MP)", w: 2560, h: 1600 },
  ],
  "10:16": [
    { label: "400 × 640 (0.26 MP)", w: 400, h: 640 },
    { label: "480 × 768 (0.37 MP)", w: 480, h: 768 },
    { label: "560 × 896 (0.50 MP)", w: 560, h: 896 },
    { label: "640 × 1024 (0.66 MP)", w: 640, h: 1024 },
    { label: "720 × 1152 (0.83 MP)", w: 720, h: 1152 },
    { label: "800 × 1280 (1.02 MP)", w: 800, h: 1280 },
    { label: "900 × 1440 (1.30 MP)", w: 900, h: 1440 },
    { label: "1050 × 1680 (1.76 MP)", w: 1050, h: 1680 },
    { label: "1200 × 1920 (2.30 MP)", w: 1200, h: 1920 },
    { label: "1600 × 2560 (4.10 MP)", w: 1600, h: 2560 },
  ],
  "21:9": [
    { label: "896 × 384 (0.34 MP)", w: 896, h: 384 },
    { label: "1024 × 448 (0.46 MP)", w: 1024, h: 448 },
    { label: "1120 × 480 (0.54 MP)", w: 1120, h: 480 },
    { label: "1216 × 512 (0.62 MP)", w: 1216, h: 512 },
    { label: "1344 × 576 (0.77 MP)", w: 1344, h: 576 },
    { label: "1536 × 640 (0.98 MP)", w: 1536, h: 640 },
    { label: "1680 × 720 (1.21 MP)", w: 1680, h: 720 },
    { label: "1792 × 768 (1.38 MP)", w: 1792, h: 768 },
    { label: "2016 × 864 (1.74 MP)", w: 2016, h: 864 },
    { label: "2144 × 928 (1.99 MP)", w: 2144, h: 928 },
    { label: "2560 × 1088 (2.79 MP)", w: 2560, h: 1088 },
    { label: "3440 × 1440 (4.95 MP)", w: 3440, h: 1440 },
  ],
  "9:21": [
    { label: "384 × 896 (0.34 MP)", w: 384, h: 896 },
    { label: "448 × 1024 (0.46 MP)", w: 448, h: 1024 },
    { label: "480 × 1120 (0.54 MP)", w: 480, h: 1120 },
    { label: "512 × 1216 (0.62 MP)", w: 512, h: 1216 },
    { label: "576 × 1344 (0.77 MP)", w: 576, h: 1344 },
    { label: "640 × 1536 (0.98 MP)", w: 640, h: 1536 },
    { label: "720 × 1680 (1.21 MP)", w: 720, h: 1680 },
    { label: "768 × 1792 (1.38 MP)", w: 768, h: 1792 },
    { label: "864 × 2016 (1.74 MP)", w: 864, h: 2016 },
    { label: "928 × 2144 (1.99 MP)", w: 928, h: 2144 },
    { label: "1088 × 2560 (2.79 MP)", w: 1088, h: 2560 },
  ],
};
const AR_LIST = Object.keys(LTX_PRESETS);
const AR_RATIOS = AR_LIST.map((k) => { const [n, d] = k.split(":").map(Number); return { key: k, ratio: n / d }; });

const MP_PRESETS = [
  { label: "0.25 MP", mp: 0.25 },
  { label: "0.36 MP", mp: 0.36 },
  { label: "0.40 MP", mp: 0.40 },
  { label: "0.50 MP", mp: 0.50 },
  { label: "0.60 MP", mp: 0.60 },
  { label: "0.75 MP", mp: 0.75 },
  { label: "0.79 MP", mp: 0.79 },
  { label: "0.92 MP (720p)", mp: 0.92 },
  { label: "1.00 MP", mp: 1.00 },
  { label: "1.25 MP", mp: 1.25 },
  { label: "1.44 MP", mp: 1.44 },
  { label: "1.50 MP", mp: 1.50 },
  { label: "2.00 MP", mp: 2.00 },
  { label: "2.07 MP (1080p)", mp: 2.07 },
  { label: "3.00 MP", mp: 3.00 },
  { label: "4.00 MP", mp: 4.00 },
];
const DURATION_PRESETS = [5, 10, 15, 20, 30];
const FPS_PRESETS = [15, 24, 30, 45, 60];

function calcMP(w, h) { return ((w * h) / 1_000_000).toFixed(2); }
function snap32(v) { return Math.max(64, Math.round(v / 32) * 32); }
function findClosestAR(ratio) {
  let best = "16:9", bd = Infinity;
  for (const a of AR_RATIOS) { const d = Math.abs(ratio - a.ratio); if (d < bd) { bd = d; best = a.key; } }
  return best;
}
function getOriginalDims(s) {
  if (!s?.image_dims) return null;
  const parts = s.image_dims.split(/[\s×x*]+/).map(Number).filter(Boolean);
  if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
    return { w: parts[0], h: parts[1], label: `Original (${parts[0]} × ${parts[1]})` };
  }
  return null;
}
function dimsFromMP(mp, arKey) {
  const ar = AR_RATIOS.find((a) => a.key === arKey) || AR_RATIOS[0];
  const area = Number(mp) * 1_000_000;
  const w = Math.sqrt(area * ar.ratio);
  return { w: snap32(w), h: snap32(w / ar.ratio) };
}
function estimateVRAM(w, h, fps, dur, mn) {
  return Math.round(((w * h / 1e6) * Math.round(fps * dur) * 0.00008 +
    (/(ltx)/i.test(mn) ? 4 : /(hunyuan)/i.test(mn) ? 12 : /(wan)/i.test(mn) ? 8 : 5)) * 10) / 10;
}

function composePromptWithTriggers(text, loras) {
  let promptText = (text || "").trim();
  const triggers = [];
  if (Array.isArray(loras)) {
    for (const row of loras) {
      if (!row || row.enabled === false) continue;
      for (const t of (row.selectedTriggers || [])) {
        const cleanT = String(t || "").trim();
        if (cleanT && !triggers.some(x => x.toLowerCase() === cleanT.toLowerCase())) {
          triggers.push(cleanT);
        }
      }
    }
  }
  if (!triggers.length) return promptText;
  const filteredTriggers = [];
  for (const t of triggers) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reg = new RegExp(`(?:\\b|_)${escaped}(?:\\b|_)`, "i");
    if (!reg.test(promptText)) {
      filteredTriggers.push(t);
    }
  }
  if (!filteredTriggers.length) return promptText;
  const prefix = filteredTriggers.join(", ").trim().replace(/,+$/, "");
  const cleanP = promptText.trim().replace(/^,+/, "").trim();
  return cleanP ? `${prefix}, ${cleanP}` : prefix;
}

// ---------------------------------------------------------------------------
// Model catalog / hardware
// ---------------------------------------------------------------------------
let _cat = null, _catAt = 0;
async function getCatalog() {
  if (_cat && Date.now() - _catAt < 10000) return _cat;
  try { const r = await fetch("/ds/prompt_sensei/models"); if (r.ok) { _cat = await r.json(); _catAt = Date.now(); return _cat; } } catch (_) { }
  return { models: [], vaes: [], clips: [], loras: [], attentions: ["default", "kitchen", "comfy_kitchen", "flash_attn", "sage_attn", "sdpa", "xformers"] };
}
let _hw = null, _hwAt = 0;
async function getHW() {
  if (_hw && Date.now() - _hwAt < 30000) return _hw;
  try { const r = await fetch("/ds/prompt_sensei/hardware"); if (r.ok) { _hw = await r.json(); _hwAt = Date.now(); return _hw; } } catch (_) { }
  return null;
}

// ---------------------------------------------------------------------------
// Dropdown popover
// ---------------------------------------------------------------------------
function openMenu(anchor, items, cur, onPick, onClose) {
  document.querySelectorAll(".ds-sensei-menu-popover").forEach((e) => e.remove());
  const pop = document.createElement("div"); pop.className = "ds-sensei-menu-popover";
  pop.style.zIndex = "100020";
  const sb = document.createElement("div"); sb.className = "ds-sensei-menu-search";
  const si = document.createElement("input"); si.placeholder = "Filter..."; sb.appendChild(si); pop.appendChild(sb);
  const list = document.createElement("div"); list.className = "ds-sensei-menu-list"; pop.appendChild(list);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    pop.remove();
    window.removeEventListener("pointerdown", close, true);
    window.removeEventListener("keydown", onKeyDown, true);
    onClose?.();
  };

  const render = (f = "") => {
    list.innerHTML = "";
    const filtered = items.filter((x) => !f || (typeof x === "string" ? x : x.label || "").toLowerCase().includes(f.toLowerCase()));
    if (!filtered.length) { const e = document.createElement("div"); e.style.cssText = "padding:8px;color:var(--ds-text-muted);font-size:11px;"; e.textContent = "No matches"; list.appendChild(e); return; }
    filtered.forEach((x) => {
      const v = typeof x === "string" ? x : x.key || x.label || x;
      const l = typeof x === "string" ? x : x.label || x.key || x;
      const el = document.createElement("div"); el.className = "ds-sensei-menu-item";
      if (v === cur) el.classList.add("active");
      el.textContent = l;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onPick(v);
        cleanup();
      });
      list.appendChild(el);
    });
  };
  si.addEventListener("input", () => render(si.value)); render();
  const rect = anchor.getBoundingClientRect();
  pop.style.cssText = `z-index:100020;top:${rect.bottom + 4}px;left:${Math.max(10, Math.min(window.innerWidth - 240, rect.left))}px;width:${Math.max(220, rect.width)}px;`;
  document.body.appendChild(pop); si.focus();

  const close = (e) => {
    if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
      cleanup();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      cleanup();
    }
  };
  setTimeout(() => {
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKeyDown, true);
  }, 20);
}

function createCustomDropdown({ value, options, placeholder = "Select...", onSelect, isCategorized = false }) {
  let flattened = [];
  if (isCategorized && Array.isArray(options) && options[0]?.category) {
    for (let c = 0; c < options.length; c++) {
      const group = options[c];
      if (c > 0) flattened.push({ separator: true });
      for (const it of (group.items || [])) {
        flattened.push({
          id: it.label || `${it.w}x${it.h}`,
          label: it.label || `${it.w}x${it.h}`,
          ...it,
        });
      }
    }
  } else {
    flattened = (options || []).map((opt) => {
      if (opt == null) return null;
      if (typeof opt === "string" || typeof opt === "number") {
        return { id: String(opt), label: String(opt) };
      }
      return {
        id: String(opt.id ?? opt.name ?? opt.value ?? opt.label ?? ""),
        label: String(opt.label ?? opt.name ?? opt.id ?? opt.value ?? ""),
        ...opt,
      };
    }).filter(Boolean);
  }

  const dd = Dropdown({
    value: String(value ?? ""),
    options: flattened,
    placeholder,
    onChange: (val, item) => {
      onSelect?.(val, item);
    },
  });

  return {
    root: dd.root,
    el: dd.root,
    trigger: dd.trigger,
    getValue: dd.getValue,
    setValue: (newVal, newLabel) => {
      dd.setValue(newVal, false);
      if (newLabel && dd.trigger?.querySelector(".ds-ui-dropdown-label")) {
        dd.trigger.querySelector(".ds-ui-dropdown-label").textContent = newLabel;
      }
    },
    setOptions: (newOpts) => {
      const newFlat = (newOpts || []).map((opt) => {
        if (typeof opt === "string" || typeof opt === "number") return { id: String(opt), label: String(opt) };
        return { id: String(opt.id ?? opt.name ?? opt.value ?? opt.label ?? ""), label: String(opt.label ?? opt.name ?? opt.id ?? opt.value ?? ""), ...opt };
      });
      dd.setOptions(newFlat);
    },
    setDisabled: dd.setDisabled,
    destroy: dd.destroy,
  };
}

function selDiv(text, onClick) {
  const d = document.createElement("div"); d.className = "ds-sensei-select";
  d.innerHTML = `<span class="ds-sensei-select-text">${text}</span><span class="ds-sensei-select-arrow">▼</span>`;
  d.onclick = onClick; return d;
}
function mkBtn(text, cls, onClick) {
  const isDanger = typeof cls === "string" && cls.includes("danger");
  const isPrimary = typeof cls === "string" && (cls.includes("primary") || cls.includes("continue"));
  const isCompact = typeof cls === "string" && cls.includes("compact");
  const isActive = typeof cls === "string" && (cls.includes("active") || cls.includes("is-active"));
  const btn = Button({
    label: text,
    variant: isDanger ? "danger" : (isPrimary ? "primary" : undefined),
    size: isCompact ? "compact" : undefined,
    active: isActive,
    className: typeof cls === "string" ? cls : undefined,
    onClick: (e) => onClick?.(e),
  });
  return btn.root;
}
function mkStepper({ value, min, max, step = 1, decimals = 0, width = "68px", placeholder = "", fallbackValue, className = "", onChange }) {
  const wrap = document.createElement("div"); wrap.className = "ds-sensei-stepper" + (className ? " " + className : ""); if (width) wrap.style.width = width;
  const inp = document.createElement("input"); inp.type = "text"; inp.inputMode = "decimal"; inp.className = "ds-sensei-stepper-input";
  if (placeholder) {
    inp.placeholder = placeholder;
    inp.title = placeholder;
  }
  const fmt = (v) => { const n = parseFloat(v); return isNaN(n) ? "" : decimals > 0 ? n.toFixed(decimals) : String(Math.round(n)); };
  inp.value = fmt(value);
  const btns = document.createElement("div"); btns.className = "ds-sensei-stepper-btns";
  const up = document.createElement("button"); up.type = "button"; up.className = "ds-sensei-stepper-btn"; up.setAttribute("tabindex", "-1");
  up.innerHTML = `<svg viewBox="0 0 10 6" width="8" height="5" style="display:block"><path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const dn = document.createElement("button"); dn.type = "button"; dn.className = "ds-sensei-stepper-btn"; dn.setAttribute("tabindex", "-1");
  dn.innerHTML = `<svg viewBox="0 0 10 6" width="8" height="5" style="display:block"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const clamp = (n) => { if (min !== undefined && n < min) n = min; if (max !== undefined && n > max) n = max; return n; };
  const fire = (n) => { inp.value = fmt(n); onChange?.(n); };
  const getBase = () => {
    const parsed = parseFloat(inp.value);
    if (!isNaN(parsed)) return parsed;
    if (fallbackValue !== undefined && fallbackValue !== null && !isNaN(parseFloat(fallbackValue))) return parseFloat(fallbackValue);
    return min ?? 0;
  };
  up.onclick = (e) => { e.stopPropagation(); fire(clamp(+((getBase() + step).toFixed(decimals > 0 ? decimals : 4)))); };
  dn.onclick = (e) => { e.stopPropagation(); fire(clamp(+((getBase() - step).toFixed(decimals > 0 ? decimals : 4)))); };
  inp.onchange = () => { const n = parseFloat(inp.value); fire(isNaN(n) ? (min ?? 0) : clamp(n)); };
  inp.onkeydown = (e) => { if (e.key === "ArrowUp") { e.preventDefault(); up.onclick(e); } else if (e.key === "ArrowDown") { e.preventDefault(); dn.onclick(e); } else if (e.key === "Enter") inp.blur(); };
  btns.append(up, dn); wrap.append(inp, btns);
  return { wrap, root: wrap, setValue: (v) => { inp.value = fmt(v); } };
}

function openSysPromptModal(cur, onSave, mode = "i2v") {
  document.querySelectorAll(".ds-sensei-modal-backdrop").forEach((e) => e.remove());
  const bd = document.createElement("div"); bd.className = "ds-sensei-modal-backdrop";
  const dlg = document.createElement("div"); dlg.className = "ds-sensei-modal-dialog";
  const title = document.createElement("div"); title.className = "ds-sensei-modal-title";
  const modeTag = mode ? ` (${mode.toUpperCase()})` : "";
  title.textContent = `System Prompt Editor${modeTag}`;
  const def = (mode && DEFAULT_SYSTEM_PROMPTS[mode]) || DEFAULT_SYSTEM_PROMPTS.i2v || DEFAULT_SYSTEM_PROMPT;
  const ta = document.createElement("textarea"); ta.className = "ds-sensei-textarea"; ta.style.minHeight = "240px";
  ta.value = cur || def;
  const footer = document.createElement("div"); footer.className = "ds-sensei-modal-footer";

  const closeModal = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    bd.remove();
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  bd.onclick = (e) => { if (e.target === bd) closeModal(); };

  footer.append(
    mkBtn("Reset Default", "", () => { ta.value = def; }),
    mkBtn("Cancel", "", closeModal),
    mkBtn("Save", "ds-sensei-btn-primary", () => { onSave(ta.value.trim()); closeModal(); })
  );
  dlg.append(title, ta, footer); bd.appendChild(dlg); document.body.appendChild(bd); ta.focus();
}

function getCivitaiApiKey() {
  try {
    const raw = localStorage.getItem("DS_LoRaLoader.settings.v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.civitaiApiKey) return parsed.civitaiApiKey;
    }
  } catch (_) { }
  return "";
}

function getCivitaiSiteMode() {
  try {
    const raw = localStorage.getItem("DS_LoRaLoader.settings.v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.siteMode) return parsed.siteMode;
    }
  } catch (_) { }
  return "Standard";
}

let _activeLoraPopover = null;

async function openCivitAIModal(node, loraRow, anchorEl) {
  if (_activeLoraPopover) {
    _activeLoraPopover.remove();
    _activeLoraPopover = null;
  }

  const modal = document.createElement("div");
  modal.className = "ds-sensei-modal";
  try { window.DSGlobalTheme?.applyToElement?.(modal); } catch (_) { }

  const head = document.createElement("div");
  head.className = "ds-sensei-modal-head";
  const title = document.createElement("strong");
  title.textContent = loraRow.name || "LoRA Metadata";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
  closeBtn.title = "Close";
  closeBtn.appendChild(DSIcon("x", { size: 14 }));

  let outsideHandler = null;
  const closeModal = () => {
    if (_activeLoraPopover === modal) {
      _activeLoraPopover = null;
    }
    modal.remove();
    if (outsideHandler) {
      document.removeEventListener("pointerdown", outsideHandler, true);
      outsideHandler = null;
    }
    node._renderUI?.();
  };

  closeBtn.onclick = closeModal;
  head.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "ds-sensei-modal-body";

  const statusRow = document.createElement("div");
  statusRow.className = "ds-sensei-modal-status-row";

  const status = document.createElement("div");
  status.className = "ds-sensei-modal-status-text";
  status.textContent = "Checking metadata cache...";

  const retrieveBtn = document.createElement("button");
  retrieveBtn.type = "button";
  retrieveBtn.className = "ds-sensei-btn-civitai";
  retrieveBtn.innerHTML = `
    ${DSIconMarkup("download", { size: 13 })}
    <span>Retrieve from CivitAI</span>
  `;

  statusRow.append(status, retrieveBtn);
  body.appendChild(statusRow);

  const tagsContainer = document.createElement("div");
  tagsContainer.className = "ds-sensei-chips-wrap";
  tagsContainer.style.marginTop = "8px";

  let triggers = Array.from(loraRow.selectedTriggers || []);
  let availableTags = [];
  let initialPositionSet = false;

  const positionSideToNode = (force = false) => {
    if (initialPositionSet && !force) return;

    const pw = 390;
    modal.style.width = `${pw}px`;

    const nodeEl = node?._domRoot || (anchorEl?.closest ? anchorEl.closest(".ds-sensei-container") : null);
    const nodeRect = (nodeEl && document.body.contains(nodeEl)) ? nodeEl.getBoundingClientRect() : null;
    const validAnchor = anchorEl && document.body.contains(anchorEl);
    const rowRect = validAnchor ? anchorEl.getBoundingClientRect() : nodeRect;
    const ph = modal.offsetHeight || 280;

    let left = 16;
    if (nodeRect) {
      if (nodeRect.right + pw + 16 <= window.innerWidth) {
        left = nodeRect.right + 12;
      } else if (nodeRect.left - pw - 16 >= 0) {
        left = nodeRect.left - pw - 12;
      } else {
        left = Math.max(12, window.innerWidth - pw - 12);
      }
    } else if (rowRect) {
      left = rowRect.right + pw + 16 <= window.innerWidth ? rowRect.right + 12 : Math.max(12, rowRect.left - pw - 12);
    }

    let top = (rowRect && rowRect.top > 0) ? rowRect.top - 8 : 80;
    if (top + ph > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - ph - 12);
    }
    top = Math.max(12, top);

    modal.style.left = `${Math.round(left)}px`;
    modal.style.top = `${Math.round(top)}px`;
    initialPositionSet = true;
  };

  const renderTags = (availableTagsList) => {
    availableTags = availableTagsList || [];
    tagsContainer.textContent = "";
    if (!availableTags.length) {
      const empty = document.createElement("div");
      empty.style.fontSize = "11px";
      empty.style.color = "var(--ds-color-muted-text, #94a3b8)";
      empty.textContent = "No trigger words found in cache. Click 'Retrieve from CivitAI' to fetch them online.";
      tagsContainer.appendChild(empty);
      if (!initialPositionSet) positionSideToNode();
      return;
    }

    for (const tag of availableTags) {
      const isSel = triggers.includes(tag);
      const chip = Button({
        label: (isSel ? "✓ " : "") + tag,
        compact: true,
        active: isSel,
        onClick: () => {
          if (triggers.includes(tag)) {
            triggers = triggers.filter(t => t !== tag);
          } else {
            triggers.push(tag);
          }
          loraRow.selectedTriggers = triggers;
          node._syncState?.();
          renderTags(availableTags);
        },
      });
      tagsContainer.appendChild(chip.root);
    }
    if (!initialPositionSet) positionSideToNode();
  };

  body.appendChild(tagsContainer);

  const foot = document.createElement("div");
  foot.className = "ds-sensei-modal-foot";
  const doneBtn = Button({
    label: "Done",
    compact: true,
    variant: "primary",
    onClick: () => {
      loraRow.selectedTriggers = triggers;
      node._syncState?.();
      node._renderUI?.();
      closeModal();
    },
  });
  foot.appendChild(doneBtn.root);

  modal.append(head, body, foot);
  document.body.appendChild(modal);
  _activeLoraPopover = modal;
  positionSideToNode();

  outsideHandler = (ev) => {
    if (!modal.contains(ev.target) && (!anchorEl || !anchorEl.contains(ev.target))) {
      closeModal();
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", outsideHandler, true), 20);

  const fetchMetadata = async (forceOnline = false) => {
    if (!loraRow.name) {
      status.textContent = "Select a LoRA model first.";
      renderTags([]);
      return;
    }

    if (forceOnline) {
      retrieveBtn.disabled = true;
      retrieveBtn.innerHTML = `
        <span style="display:inline-block;animation:ds-sensei-spin 1s linear infinite;">⏳</span>
        <span>Retrieving...</span>
      `;
      status.textContent = "Querying CivitAI (computing hash)...";
    } else {
      status.textContent = "Checking cache...";
    }

    try {
      const requestMetadata = async (online) => {
        const res = await fetch("/ds/lora_metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: loraRow.name,
            forceOnline: online,
            apiKey: getCivitaiApiKey(),
            allowNsfw: true,
            siteMode: getCivitaiSiteMode(),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      };

      const data = await requestMetadata(forceOnline);
      if (data?.ok) {
        let words = Array.isArray(data.trainedWords)
          ? data.trainedWords.filter((x) => String(x).trim()).map((x) => String(x).trim())
          : [];

        // A Sensei-only workflow must not depend on the LoRa Loader having
        // been opened first. If the hash lookup identifies a CivitAI model
        // but returns an empty trainedWords array, ask CivitAI directly for
        // the model record and recover the trigger words for the exact model
        // version / matching local filename.
        if (forceOnline && !words.length && data.modelId) {
          try {
            const headers = {};
            const apiKey = getCivitaiApiKey();
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
            const modelRes = await fetch(
              `https://civitai.com/api/v1/models/${encodeURIComponent(data.modelId)}`,
              { headers }
            );
            if (modelRes.ok) {
              const modelData = await modelRes.json();
              const versions = Array.isArray(modelData?.modelVersions) ? modelData.modelVersions : [];
              let match = versions.find((v) => String(v?.id) === String(data.modelVersionId));

              if (!match && loraRow.name) {
                const localBase = String(loraRow.name).split(/[\\/]/).pop().toLowerCase();
                match = versions.find((v) =>
                  Array.isArray(v?.files) && v.files.some((f) => String(f?.name || "").toLowerCase() === localBase)
                );
              }

              if (Array.isArray(match?.trainedWords)) {
                words = match.trainedWords.filter((x) => String(x).trim()).map((x) => String(x).trim());
              }
            }
          } catch (_) {
            // Keep the primary metadata response; CivitAI direct fallback is optional.
          }
        }

        // Also read the local/embedded metadata path after a forced online
        // lookup. This does not require the LoRa Loader node to have ever
        // been used; it only reads metadata for the selected file.
        if (forceOnline && !words.length) {
          try {
            const localData = await requestMetadata(false);
            if (localData?.ok && Array.isArray(localData.trainedWords)) {
              words = localData.trainedWords
                .filter((x) => String(x).trim())
                .map((x) => String(x).trim());
            }
          } catch (_) {
            // Online result remains authoritative if the local fallback is unavailable.
          }
        }

        status.textContent = `Source: ${data.source || (forceOnline ? "civitai" : "cache")}`;
        const combined = Array.from(new Set([...words, ...triggers]));
        renderTags(combined);
        if (forceOnline && !words.length) {
          status.textContent = "Model found on CivitAI, but no trigger words are registered.";
        } else if (forceOnline && words.length) {
          status.textContent = "Found on CivitAI. Trigger words loaded.";
        }
      } else {
        status.textContent = data?.error || (forceOnline ? "CivitAI lookup returned no metadata." : "No cache found. Click 'Retrieve from CivitAI' to fetch.");
        renderTags(triggers);
      }
    } catch (e) {
      status.textContent = "Request failed: " + (e?.message || e);
    } finally {
      retrieveBtn.disabled = false;
      retrieveBtn.innerHTML = `
        ${DSIconMarkup("download", { size: 13 })}
        <span>Retrieve from CivitAI</span>
      `;
    }
  };

  retrieveBtn.onclick = () => fetchMetadata(true);
  fetchMetadata(false);
}

// ---------------------------------------------------------------------------
// LM Studio Toolbar Gear Popover & Queue Hooking
// ---------------------------------------------------------------------------

let _activeSenseiGearPopup = null;
let _activeSenseiNode = null;

function closeSenseiGearConfig() {
  if (_activeSenseiGearPopup) {
    _activeSenseiGearPopup.remove();
    _activeSenseiGearPopup = null;
  }
  if (_activeSenseiNode) {
    _activeSenseiNode._renderUI?.();
    fitNode(_activeSenseiNode);
    scheduleAlign(_activeSenseiNode);
    _activeSenseiNode = null;
  }
}

async function fetchLMStudioModels(ip = "127.0.0.1", port = 1234) {
  try {
    const r = await fetch(`/ds/prompt_sensei/lm_studio/models?ip=${encodeURIComponent(ip)}&port=${encodeURIComponent(port)}`);
    if (r.ok) {
      return await r.json();
    }
  } catch (e) {
    console.error("[Sensei] Error fetching LM Studio models:", e);
  }
  return { ok: false, error: "LM Studio unavailable", address: `${ip}:${port}`, models: [] };
}

async function fetchBuiltinModels() {
  try {
    const r = await fetch("/ds/prompt_sensei/builtin/models");
    if (r.ok) {
      return await r.json();
    }
  } catch (e) {
    console.error("[Sensei] Error fetching Built-In models:", e);
  }
  return { ok: false, error: "Failed to scan built-in models", models: [] };
}

async function fetchBuiltinStatus() {
  try {
    const r = await fetch("/ds/prompt_sensei/builtin/status");
    if (r.ok) {
      return await r.json();
    }
  } catch (e) {
    console.error("[Sensei] Error fetching Built-In status:", e);
  }
  return { ok: false, loaded: false };
}

async function unloadBuiltinModel() {
  try {
    const r = await fetch("/ds/prompt_sensei/builtin/unload", { method: "POST" });
    if (r.ok) {
      return await r.json();
    }
  } catch (e) {
    console.error("[Sensei] Error unloading Built-In model:", e);
  }
  return { ok: false };
}

let _senseiCachedHW = null;
let _senseiHWFetchPromise = null;
async function fetchSenseiHardware() {
  if (_senseiCachedHW) return _senseiCachedHW;
  if (!_senseiHWFetchPromise) {
    _senseiHWFetchPromise = fetch("/ds/prompt_sensei/hardware")
      .then((r) => r.json())
      .then((hw) => {
        _senseiCachedHW = hw;
        return hw;
      })
      .catch((e) => {
        _senseiHWFetchPromise = null;
        console.error("[Sensei] Error detecting hardware:", e);
        return null;
      });
  }
  return _senseiHWFetchPromise;
}

function openSenseiGearConfig(node, anchorEl) {
  closeSenseiGearConfig();
  if (!node) return;
  _activeSenseiNode = node;

  const s = node._sstate;
  if (!s.lm_studio) {
    s.lm_studio = { ...defaultState().lm_studio };
  }
  if (!s.built_in) {
    s.built_in = { ...defaultState().built_in };
  }
  const lm = s.lm_studio;
  const bi = s.built_in;

  let activeTab = s.gear_tab || (s.provider === "built_in" ? "built_in" : "lm_studio");

  const popup = document.createElement("div");
  popup.className = "ds-sensei-gear-popover";
  popup.dataset.dsThemed = "true";
  try { window.DSGlobalTheme?.applyToElement?.(popup); } catch (_) { }

  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  popup.addEventListener("mousedown", (e) => e.stopPropagation());
  popup.addEventListener("click", (e) => e.stopPropagation());

  const sync = () => {
    node._syncState?.();
    node._renderUI?.();
  };

  // Position popup next to node on its side with safe screen clamping
  const adjustPopoverPos = () => {
    const pw = popup.offsetWidth || 380;
    const ph = popup.offsetHeight || 500;
    let placed = false;

    if (node && node.pos && app.canvas?.ds) {
      try {
        const ds = app.canvas.ds;
        const canvasEl = app.canvas.canvas;
        const cRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 };

        const screenX = cRect.left + (node.pos[0] + ds.offset[0]) * ds.scale;
        const screenY = cRect.top + (node.pos[1] + ds.offset[1]) * ds.scale;
        const nodeW = (node.size ? node.size[0] : 420) * ds.scale;

        let left = screenX + nodeW + 16;
        let top = Math.max(15, Math.min(screenY, window.innerHeight - ph - 25));

        if (left + pw > window.innerWidth - 15) {
          if (screenX - pw - 16 >= 15) {
            left = screenX - pw - 16;
          } else {
            left = Math.max(15, window.innerWidth - pw - 15);
          }
        }

        popup.style.left = `${Math.round(left)}px`;
        popup.style.top = `${Math.round(top)}px`;
        placed = true;
      } catch (_) { }
    }

    if (!placed) {
      if (anchorEl && typeof anchorEl.getBoundingClientRect === "function") {
        const rect = anchorEl.getBoundingClientRect();
        let left = rect.right + 12;
        if (left + pw > window.innerWidth - 15) left = Math.max(15, rect.left - pw - 12);
        let top = Math.max(15, Math.min(rect.top, window.innerHeight - ph - 25));
        popup.style.left = `${Math.round(left)}px`;
        popup.style.top = `${Math.round(top)}px`;
      } else {
        popup.style.left = `${Math.max(15, window.innerWidth - pw - 25)}px`;
        popup.style.top = `60px`;
      }
    }
  };

  const renderContent = () => {
    popup.innerHTML = "";

    // ── Header
    const head = document.createElement("div");
    head.className = "ds-sensei-gear-header";

    const subTitle = activeTab === "built_in"
      ? "Built-In LLM Configuration"
      : (activeTab === "lm_studio" ? "LM Studio Configuration" : "Node & Behavior Settings");

    const titleWrap = document.createElement("div");
    titleWrap.className = "ds-sensei-gear-title-wrap";
    titleWrap.innerHTML = `
      <span class="ds-sensei-gear-badge">DS</span>
      <div>
        <strong class="ds-sensei-gear-title">DS AI Prompt Sensei</strong>
        <small class="ds-sensei-gear-sub">${subTitle}</small>
      </div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ds-ui-btn ds-ui-btn-icon-only ds-ui-btn-compact";
    closeBtn.title = "Close";
    closeBtn.appendChild(DSIcon("x", { size: 14 }));
    closeBtn.onclick = closeSenseiGearConfig;

    head.append(titleWrap, closeBtn);
    popup.appendChild(head);

    // ── Tab Strip: [ ⚡ LM Studio | 🧠 Built In | ⚙ Settings ]
    const tabStrip = document.createElement("div");
    tabStrip.className = "ds-sensei-gear-tabs";

    const tabLm = document.createElement("button");
    tabLm.type = "button";
    tabLm.className = `ds-sensei-gear-tab-btn ${activeTab === "lm_studio" ? "is-active" : ""}`;
    tabLm.innerHTML = `${DSIconMarkup("server", { size: 12 })}<span>LM Studio</span>`;
    tabLm.onclick = () => {
      activeTab = "lm_studio";
      s.gear_tab = "lm_studio";
      s.provider = "lm_studio";
      sync();
      renderContent();
    };

    const tabBi = document.createElement("button");
    tabBi.type = "button";
    tabBi.className = `ds-sensei-gear-tab-btn ${activeTab === "built_in" ? "is-active" : ""}`;
    tabBi.innerHTML = `<span>🧠</span><span>Built In</span>`;
    tabBi.onclick = () => {
      activeTab = "built_in";
      s.gear_tab = "built_in";
      s.provider = "built_in";
      sync();
      renderContent();
    };

    const tabSet = document.createElement("button");
    tabSet.type = "button";
    tabSet.className = `ds-sensei-gear-tab-btn ${activeTab === "settings" ? "is-active" : ""}`;
    tabSet.innerHTML = `${DSIconMarkup("settings", { size: 12 })}<span>Settings</span>`;
    tabSet.onclick = () => {
      activeTab = "settings";
      s.gear_tab = "settings";
      sync();
      renderContent();
    };

    tabStrip.append(tabLm, tabBi, tabSet);
    popup.appendChild(tabStrip);

    if (activeTab === "lm_studio") {
      // ── Model (Full Width)
      const modelSec = document.createElement("div");
      modelSec.className = "ds-sensei-gear-field";
      const modelLbl = document.createElement("label");
      modelLbl.className = "ds-sensei-gear-label";
      modelLbl.textContent = "Model";

      const modelDd = createCustomDropdown({
        value: lm.model || "",
        options: lm.model ? [lm.model] : [],
        placeholder: "Select LM Studio Model...",
        onSelect: (selected) => {
          lm.model = selected;
          s.error_msg = null;
          sync();
        },
      });
      modelDd.el.style.width = "100%";
      modelSec.append(modelLbl, modelDd.el);
      popup.appendChild(modelSec);

      fetchLMStudioModels(lm.ip, lm.port).then((res) => {
        if (res.ok && res.models?.length > 0) {
          const llmModels = res.models.filter((m) => !/(embed|nomic-embed|bge-)/i.test(m));
          const displayModels = llmModels.length > 0 ? llmModels : res.models;
          modelDd.setOptions(displayModels);
          if (!lm.model && displayModels.length > 0) {
            lm.model = displayModels[0];
            modelDd.setValue(displayModels[0]);
            sync();
          }
        }
      });

      const scrollBody = document.createElement("div");
      scrollBody.className = "ds-sensei-gear-scroll-body";
      popup.appendChild(scrollBody);

      // ── IP Address & Port (2 Columns)
      const connRow = document.createElement("div");
      connRow.className = "ds-sensei-gear-row-2col";

      const ipField = document.createElement("div");
      ipField.className = "ds-sensei-gear-field";
      ipField.innerHTML = `<label class="ds-sensei-gear-label">IP Address</label>`;
      const ipInp = document.createElement("input");
      ipInp.type = "text";
      ipInp.className = "ds-sensei-input";
      ipInp.value = lm.ip || "127.0.0.1";
      ipInp.onchange = () => {
        lm.ip = ipInp.value.trim() || "127.0.0.1";
        sync();
      };
      ipField.appendChild(ipInp);

      const portField = document.createElement("div");
      portField.className = "ds-sensei-gear-field";
      portField.innerHTML = `<label class="ds-sensei-gear-label">Port</label>`;
      const portInp = document.createElement("input");
      portInp.type = "number";
      portInp.className = "ds-sensei-input";
      portInp.value = lm.port || 1234;
      portInp.onchange = () => {
        lm.port = parseInt(portInp.value) || 1234;
        sync();
      };
      portField.appendChild(portInp);

      connRow.append(ipField, portField);
      scrollBody.appendChild(connRow);

      // ── Sampling (Max Tokens & Temperature)
      const samplingLbl = document.createElement("div");
      samplingLbl.className = "ds-sensei-gear-section-label";
      samplingLbl.textContent = "Sampling";
      scrollBody.appendChild(samplingLbl);

      const samplingRow = document.createElement("div");
      samplingRow.className = "ds-sensei-gear-row-2col";

      const maxTokensField = document.createElement("div");
      maxTokensField.className = "ds-sensei-gear-field";
      maxTokensField.innerHTML = `<label class="ds-sensei-gear-label">Max Tokens</label>`;
      const mtSt = mkStepper({
        value: lm.max_tokens ?? 2048,
        min: 1,
        max: 131072,
        step: 128,
        decimals: 0,
        width: "100%",
        onChange: (v) => {
          lm.max_tokens = parseInt(v) || 2048;
          sync();
        },
      });
      maxTokensField.appendChild(mtSt.wrap);

      const tempField = document.createElement("div");
      tempField.className = "ds-sensei-gear-field";
      tempField.innerHTML = `<label class="ds-sensei-gear-label">Temperature</label>`;
      const tempSt = mkStepper({
        value: lm.temperature ?? 0.7,
        min: 0.0,
        max: 2.0,
        step: 0.05,
        decimals: 2,
        width: "100%",
        onChange: (v) => {
          lm.temperature = parseFloat(v) ?? 0.7;
          sync();
        },
      });
      tempField.appendChild(tempSt.wrap);

      samplingRow.append(maxTokensField, tempField);
      scrollBody.appendChild(samplingRow);

      // ── Seed & Timeout
      const seedTimeoutRow = document.createElement("div");
      seedTimeoutRow.className = "ds-sensei-gear-row-2col";

      const seedField = document.createElement("div");
      seedField.className = "ds-sensei-gear-field";

      const seedHdr = document.createElement("div");
      seedHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";
      const seedLbl = document.createElement("label");
      seedLbl.className = "ds-sensei-gear-label";
      seedLbl.textContent = "Seed";
      const diceBtn = document.createElement("button");
      diceBtn.type = "button";
      diceBtn.className = "ds-sensei-btn-compact";
      diceBtn.style.cssText = "height:16px;line-height:16px;padding:0 5px;font-size:10px;font-weight:700;color:var(--ds-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;";
      diceBtn.title = "Roll new random seed";
      diceBtn.textContent = "🎲 Roll";
      seedHdr.append(seedLbl, diceBtn);
      seedField.appendChild(seedHdr);

      const seedInp = document.createElement("input");
      seedInp.type = "number";
      seedInp.className = "ds-sensei-input";
      seedInp.style.cssText = "width:100%;box-sizing:border-box;min-width:0;";
      seedInp.value = lm.seed ?? 123456;
      seedInp.onchange = () => {
        lm.seed = parseInt(seedInp.value) || 0;
        sync();
      };
      diceBtn.onclick = () => {
        const r = Math.floor(Math.random() * 2147483647);
        lm.seed = r;
        seedInp.value = r;
        sync();
      };
      seedField.appendChild(seedInp);

      const timeoutField = document.createElement("div");
      timeoutField.className = "ds-sensei-gear-field";
      const timeoutHdr = document.createElement("div");
      timeoutHdr.style.cssText = "display:flex;align-items:center;height:16px;";
      const timeoutLbl = document.createElement("label");
      timeoutLbl.className = "ds-sensei-gear-label";
      timeoutLbl.textContent = "Timeout (s)";
      timeoutHdr.appendChild(timeoutLbl);
      timeoutField.appendChild(timeoutHdr);

      const timeoutInp = document.createElement("input");
      timeoutInp.type = "number";
      timeoutInp.className = "ds-sensei-input";
      timeoutInp.style.cssText = "width:100%;box-sizing:border-box;min-width:0;";
      timeoutInp.value = lm.timeout ?? 300;
      timeoutInp.onchange = () => {
        lm.timeout = Math.max(5, parseInt(timeoutInp.value) || 300);
        sync();
      };
      timeoutField.appendChild(timeoutInp);

      seedTimeoutRow.append(seedField, timeoutField);
      scrollBody.appendChild(seedTimeoutRow);
    } else if (activeTab === "built_in") {
      // ── Built-In LLM Settings Tab
      // 1. Status Banner
      const statusBanner = document.createElement("div");
      statusBanner.className = "ds-sensei-gear-status-card";
      statusBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <span class="ds-sensei-gear-status-dot is-idle"></span>
          <span class="ds-sensei-gear-status-text" style="font-size:11px;color:var(--ds-color-muted-text,#94a3b8);">Checking status...</span>
        </div>
      `;
      popup.appendChild(statusBanner);

      const refreshStatus = () => {
        fetchBuiltinStatus().then((st) => {
          if (!popup.contains(statusBanner)) return;
          const dot = statusBanner.querySelector(".ds-sensei-gear-status-dot");
          const txt = statusBanner.querySelector(".ds-sensei-gear-status-text");
          if (!dot || !txt) return;
          if (st.loaded) {
            dot.className = "ds-sensei-gear-status-dot is-loaded";
            const visBadge = st.has_vision ? " [Vision]" : "";
            txt.innerHTML = `<strong style="color:var(--ds-color-accent,#67e8f9)">Loaded:</strong> ${st.model_name || "Active"}${visBadge} · ${st.vram_free_mb || 0} MB free`;
          } else {
            dot.className = "ds-sensei-gear-status-dot is-idle";
            txt.textContent = "○ No model loaded in VRAM";
          }
        });
      };
      refreshStatus();

      // 2. Model Selection + Rescan Button
      const modelSec = document.createElement("div");
      modelSec.className = "ds-sensei-gear-field";

      const modelHdr = document.createElement("div");
      modelHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";
      const modelLbl = document.createElement("label");
      modelLbl.className = "ds-sensei-gear-label";
      modelLbl.textContent = "GGUF Model";

      const rescanBtn = document.createElement("button");
      rescanBtn.type = "button";
      rescanBtn.className = "ds-sensei-btn-compact ds-sensei-gear-rescan-btn";
      rescanBtn.style.cssText = "height:18px;line-height:18px;padding:0 6px;font-size:10px;font-weight:700;color:var(--ds-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;";
      rescanBtn.innerHTML = `${DSIconMarkup("refresh-cw", { size: 11 })}<span>Rescan</span>`;
      modelHdr.append(modelLbl, rescanBtn);
      modelSec.appendChild(modelHdr);

      const modelDd = createCustomDropdown({
        value: bi.model || "",
        options: bi.model ? [bi.model] : [],
        placeholder: "Scanning models in ComfyUI/models/LLM...",
        onSelect: (selected) => {
          bi.model = selected;
          s.error_msg = null;
          sync();
        },
      });
      modelDd.el.style.width = "100%";
      modelSec.appendChild(modelDd.el);
      popup.appendChild(modelSec);

      const loadModelsIntoDd = () => {
        fetchBuiltinModels().then((res) => {
          if (res.ok && res.models?.length > 0) {
            const modelIds = res.models.map((m) => m.id);
            modelDd.setOptions(modelIds);
            if (!bi.model || !modelIds.includes(bi.model)) {
              bi.model = modelIds[0];
              modelDd.setValue(modelIds[0]);
              sync();
            } else {
              modelDd.setValue(bi.model);
            }
          } else {
            modelDd.setOptions([]);
            modelDd.setValue("");
          }
        });
      };
      loadModelsIntoDd();
      rescanBtn.onclick = () => {
        loadModelsIntoDd();
        refreshStatus();
      };

      // Scrollable container for controls below model dropdown
      const scrollBody = document.createElement("div");
      scrollBody.className = "ds-sensei-gear-scroll-body";
      popup.appendChild(scrollBody);

      // Hardware Detection & VRAM Advisory Card
      const hwBox = document.createElement("div");
      hwBox.className = "ds-sensei-gear-field";
      hwBox.style.cssText = "display:flex;flex-direction:column;gap:5px;width:100%;margin-top:2px;";

      let gpuSt = null;

      const calcRecommendedLayers = (hw) => {
        if (!hw) return 15;
        const vramMB = hw.total_vram_mb || 0;
        if (!hw.has_gpu || vramMB === 0) return 0;
        if (vramMB <= 4096) return 8;
        if (vramMB <= 6144) return 15;
        if (vramMB <= 8192) return 22;
        return -1;
      };

      const formatHWName = (hw) => {
        if (!hw) return "Detecting hardware...";
        const vramMB = hw.total_vram_mb || 0;
        if (!hw.has_gpu || vramMB === 0) {
          return `CPU Only (${Math.round((hw.system_ram_mb || 0) / 1024)}GB RAM)`;
        }
        const vramGB = (vramMB / 1024).toFixed(1).replace(/\.0$/, "");
        return `${hw.gpu_name} (${vramGB}GB VRAM)`;
      };

      let detectedHW = _senseiCachedHW;
      let recommendedLayers = calcRecommendedLayers(detectedHW);

      const hwCard = document.createElement("div");
      hwCard.className = "ds-sensei-gear-hw-card";
      hwCard.innerHTML = `
        <div class="ds-sensei-gear-hw-top">
          <div class="ds-sensei-gear-hw-left">
            ${DSIconMarkup("cpu", { size: 13, color: "var(--ds-color-accent, #67e8f9)" })}
            <span class="ds-sensei-hw-name">${formatHWName(detectedHW)}</span>
          </div>
          <button type="button" class="ds-sensei-btn-compact ds-sensei-autotune-btn" style="${detectedHW ? 'display:inline-flex;' : 'display:none;'}">
            💡 Auto-Tune (${recommendedLayers === -1 ? 'ALL' : recommendedLayers})
          </button>
        </div>
      `;
      hwBox.appendChild(hwCard);

      const hwWarn = document.createElement("div");
      hwWarn.className = "ds-sensei-gear-hw-warn";
      hwWarn.style.display = "none";
      hwBox.appendChild(hwWarn);
      scrollBody.appendChild(hwBox);

      const updateHWWarn = () => {
        const curLayers = bi.n_gpu_layers ?? 15;
        if (!detectedHW) {
          hwWarn.classList.remove("is-visible");
          hwWarn.style.display = "none";
          hwWarn.innerHTML = "";
          return;
        }
        const vramMB = detectedHW.total_vram_mb || 0;
        const hasGpu = detectedHW.has_gpu;

        let warnHtml = null;
        if (!hasGpu || vramMB === 0) {
          if (curLayers !== 0) {
            warnHtml = `${DSIconMarkup("alert-circle", { size: 13, color: "#f59e0b" })}<span>No dedicated GPU detected. Set GPU Layers to 0 (CPU Only) to avoid freezing.</span>`;
          }
        } else if (vramMB <= 4096) {
          if (curLayers > 10 || curLayers === -1) {
            warnHtml = `${DSIconMarkup("alert-circle", { size: 13, color: "#f59e0b" })}<span>High layers (${curLayers === -1 ? 'ALL' : curLayers}) on 4GB VRAM! May cause OOM or freeze. Recommended: 8–10 layers.</span>`;
          }
        } else if (vramMB <= 6144) {
          if (curLayers > 20 || curLayers === -1) {
            warnHtml = `${DSIconMarkup("alert-circle", { size: 13, color: "#f59e0b" })}<span>High layers (${curLayers === -1 ? 'ALL' : curLayers}) on 6GB VRAM! Will overflow into system RAM and freeze. Recommended: 15 layers.</span>`;
          }
        } else if (vramMB <= 8192) {
          if (curLayers === -1) {
            warnHtml = `${DSIconMarkup("alert-circle", { size: 13, color: "#f59e0b" })}<span>Offloading all layers (-1) on 8GB VRAM may conflict with ComfyUI models. Recommended: 20–24 layers.</span>`;
          }
        }

        if (warnHtml) {
          hwWarn.innerHTML = warnHtml;
          hwWarn.classList.add("is-visible");
          hwWarn.style.display = "flex";
        } else {
          hwWarn.classList.remove("is-visible");
          hwWarn.style.display = "none";
          hwWarn.innerHTML = "";
        }
      };

      const onTuneClick = () => {
        bi.n_gpu_layers = recommendedLayers;
        if (gpuSt) gpuSt.setValue(recommendedLayers);
        sync();
        updateHWWarn();
      };

      const tuneBtn = hwCard.querySelector(".ds-sensei-autotune-btn");
      if (tuneBtn) {
        tuneBtn.onclick = onTuneClick;
      }

      if (!detectedHW) {
        fetchSenseiHardware().then((hw) => {
          if (!popup.contains(hwBox) || !hw) return;
          detectedHW = hw;
          recommendedLayers = calcRecommendedLayers(hw);
          const nameSpan = hwCard.querySelector(".ds-sensei-hw-name");
          const btn = hwCard.querySelector(".ds-sensei-autotune-btn");
          if (nameSpan) nameSpan.textContent = formatHWName(hw);
          if (btn) {
            btn.style.display = "inline-flex";
            btn.textContent = `💡 Auto-Tune (${recommendedLayers === -1 ? 'ALL' : recommendedLayers})`;
            btn.onclick = onTuneClick;
          }
          updateHWWarn();
        });
      }

      // Sampling: Temperature & Max Tokens (2 columns)
      const sampHdr = document.createElement("div");
      sampHdr.className = "ds-sensei-gear-section-label";
      sampHdr.textContent = "Sampling";
      scrollBody.appendChild(sampHdr);

      const sampRow = document.createElement("div");
      sampRow.className = "ds-sensei-gear-row-2col";

      const tempField = document.createElement("div");
      tempField.className = "ds-sensei-gear-field";
      tempField.innerHTML = `<label class="ds-sensei-gear-label">Temperature</label>`;
      const tempSt = mkStepper({
        value: bi.temperature ?? 0.7,
        min: 0.0,
        max: 2.0,
        step: 0.05,
        decimals: 2,
        width: "100%",
        onChange: (v) => {
          bi.temperature = parseFloat(v) ?? 0.7;
          sync();
        },
      });
      tempField.appendChild(tempSt.wrap);

      const maxTokField = document.createElement("div");
      maxTokField.className = "ds-sensei-gear-field";
      maxTokField.innerHTML = `<label class="ds-sensei-gear-label">Max Tokens</label>`;
      const maxTokSt = mkStepper({
        value: bi.max_tokens ?? 2048,
        min: 64,
        max: 8192,
        step: 128,
        decimals: 0,
        width: "100%",
        onChange: (v) => {
          bi.max_tokens = parseInt(v) || 2048;
          sync();
        },
      });
      maxTokField.appendChild(maxTokSt.wrap);

      sampRow.append(tempField, maxTokField);
      scrollBody.appendChild(sampRow);

      // Context & GPU Offload (2 columns)
      const ctxGpuRow = document.createElement("div");
      ctxGpuRow.className = "ds-sensei-gear-row-2col";

      const ctxField = document.createElement("div");
      ctxField.className = "ds-sensei-gear-field";
      ctxField.innerHTML = `<label class="ds-sensei-gear-label">Context Length</label>`;
      const ctxSt = mkStepper({
        value: bi.context_length ?? 8192,
        min: 1024,
        max: 32768,
        step: 1024,
        decimals: 0,
        width: "100%",
        onChange: (v) => {
          bi.context_length = parseInt(v) || 8192;
          sync();
        },
      });
      ctxField.appendChild(ctxSt.wrap);

      const gpuField = document.createElement("div");
      gpuField.className = "ds-sensei-gear-field";
      gpuField.innerHTML = `<label class="ds-sensei-gear-label">GPU Layers (-1=All)</label>`;
      gpuSt = mkStepper({
        value: bi.n_gpu_layers ?? 15,
        min: -1,
        max: 128,
        step: 1,
        decimals: 0,
        width: "100%",
        onChange: (v) => {
          bi.n_gpu_layers = parseInt(v) ?? 15;
          sync();
          updateHWWarn();
        },
      });
      gpuField.appendChild(gpuSt.wrap);

      ctxGpuRow.append(ctxField, gpuField);
      scrollBody.appendChild(ctxGpuRow);
      updateHWWarn();

      // Advanced Sampling (Top-P, Top-K, Rep. Penalty)
      const advHdr = document.createElement("div");
      advHdr.className = "ds-sensei-gear-section-label";
      advHdr.textContent = "Advanced Sampling";
      scrollBody.appendChild(advHdr);

      const advRow = document.createElement("div");
      advRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;width:100%;box-sizing:border-box;";

      const topPField = document.createElement("div");
      topPField.className = "ds-sensei-gear-field";
      topPField.innerHTML = `<label class="ds-sensei-gear-label">Top P</label>`;
      const topPSt = mkStepper({
        value: bi.top_p ?? 0.95,
        min: 0.0,
        max: 1.0,
        step: 0.05,
        decimals: 2,
        width: "100%",
        onChange: (v) => {
          bi.top_p = parseFloat(v) ?? 0.95;
          sync();
        },
      });
      topPField.appendChild(topPSt.wrap);

      const topKField = document.createElement("div");
      topKField.className = "ds-sensei-gear-field";
      topKField.innerHTML = `<label class="ds-sensei-gear-label">Top K</label>`;
      const topKSt = mkStepper({
        value: bi.top_k ?? 40,
        min: 0,
        max: 200,
        step: 5,
        decimals: 0,
        width: "100%",
        onChange: (v) => {
          bi.top_k = parseInt(v) ?? 40;
          sync();
        },
      });
      topKField.appendChild(topKSt.wrap);

      const repField = document.createElement("div");
      repField.className = "ds-sensei-gear-field";
      repField.innerHTML = `<label class="ds-sensei-gear-label">Rep. Penalty</label>`;
      const repSt = mkStepper({
        value: bi.repetition_penalty ?? 1.1,
        min: 1.0,
        max: 2.0,
        step: 0.05,
        decimals: 2,
        width: "100%",
        onChange: (v) => {
          bi.repetition_penalty = parseFloat(v) ?? 1.1;
          sync();
        },
      });
      repField.appendChild(repSt.wrap);

      advRow.append(topPField, topKField, repField);
      scrollBody.appendChild(advRow);

      // Seed
      const seedField = document.createElement("div");
      seedField.className = "ds-sensei-gear-field";
      const sHdr = document.createElement("div");
      sHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;";
      const sLbl = document.createElement("label");
      sLbl.className = "ds-sensei-gear-label";
      sLbl.textContent = "Seed";
      const biDiceBtn = document.createElement("button");
      biDiceBtn.type = "button";
      biDiceBtn.className = "ds-sensei-btn-compact";
      biDiceBtn.style.cssText = "height:16px;line-height:16px;padding:0 5px;font-size:10px;font-weight:700;color:var(--ds-accent,#67e8f9);background:rgba(103,232,249,0.12);border:none;border-radius:3px;cursor:pointer;";
      biDiceBtn.title = "Roll new random seed";
      biDiceBtn.textContent = "🎲 Roll";
      sHdr.append(sLbl, biDiceBtn);
      seedField.appendChild(sHdr);

      const biSeedInp = document.createElement("input");
      biSeedInp.type = "number";
      biSeedInp.className = "ds-sensei-input";
      biSeedInp.style.cssText = "width:100%;box-sizing:border-box;min-width:0;";
      biSeedInp.value = bi.seed ?? 123456;
      biSeedInp.onchange = () => {
        bi.seed = parseInt(biSeedInp.value) || 0;
        sync();
      };
      biDiceBtn.onclick = () => {
        const r = Math.floor(Math.random() * 2147483647);
        bi.seed = r;
        biSeedInp.value = r;
        sync();
      };
      seedField.appendChild(biSeedInp);
      scrollBody.appendChild(seedField);

      // Unload Model Now Button
      const unloadBtn = document.createElement("button");
      unloadBtn.type = "button";
      unloadBtn.className = "ds-ui-btn ds-ui-btn-secondary ds-sensei-gear-unload-btn";
      unloadBtn.style.marginTop = "6px";
      unloadBtn.innerHTML = `${DSIconMarkup("trash-2", { size: 13, color: "var(--ds-color-danger, #f87171)" })}<span>Unload Model Now</span>`;
      unloadBtn.onclick = async () => {
        unloadBtn.disabled = true;
        await unloadBuiltinModel();
        unloadBtn.disabled = false;
        refreshStatus();
      };
      scrollBody.appendChild(unloadBtn);
    } else {
      // ── Tab 3: Settings (Section Order & Behavior Controls)
      const scrollBody = document.createElement("div");
      scrollBody.className = "ds-sensei-gear-scroll-body";
      popup.appendChild(scrollBody);

      // ── Section Order (Drag to reorder)
      const orderTitle = document.createElement("div");
      orderTitle.className = "ds-sensei-gear-section-label";
      orderTitle.textContent = "SECTION ORDER (Drag to reorder)";
      scrollBody.appendChild(orderTitle);

      const orderList = document.createElement("div");
      orderList.className = "ds-sensei-order-list";

      const sectionLabels = {
        image: "Image",
        models: "Models",
        lora: "LoRA Loader",
        video: "Settings",
        notes: "Scene Notes",
        prompt: "Generated Prompt",
      };
      const sectionIcons = {
        image: "image",
        models: "cpu",
        lora: "layers",
        video: "sliders",
        notes: "file-text",
        prompt: "sparkles",
      };

      if (!Array.isArray(s.section_order) || s.section_order.length !== 6) {
        s.section_order = ["image", "models", "lora", "video", "notes", "prompt"];
      }

      let draggedSectionIdx = null;

      const renderOrderCards = () => {
        orderList.textContent = "";
        s.section_order.forEach((key, idx) => {
          const card = document.createElement("div");
          card.className = "ds-sensei-order-card";
          card.draggable = true;
          card.dataset.orderIdx = String(idx);
          card.innerHTML = `<span class="ds-sensei-drag-handle">${DSIconMarkup("grip-vertical", { size: 14 })}</span><span style="display:inline-flex;align-items:center;gap:6px;">${DSIconMarkup(sectionIcons[key] || "circle", { size: 13, color: "var(--ds-color-accent, #67e8f9)" })}<span>${sectionLabels[key] || key}</span></span>`;

          card.ondragstart = (e) => {
            draggedSectionIdx = idx;
            if (e.dataTransfer) {
              e.dataTransfer.setData("text/plain", String(idx));
              e.dataTransfer.effectAllowed = "move";
            }
            card.classList.add("is-dragging");
          };

          card.ondragover = (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            card.classList.add("is-dragover");
          };

          card.ondragleave = (e) => {
            if (!card.contains(e.relatedTarget)) card.classList.remove("is-dragover");
          };

          card.ondrop = (e) => {
            e.preventDefault();
            card.classList.remove("is-dragover");
            let fromIdx = draggedSectionIdx;
            if (fromIdx == null && e.dataTransfer) {
              const parsed = parseInt(e.dataTransfer.getData("text/plain"), 10);
              if (Number.isInteger(parsed)) fromIdx = parsed;
            }
            if (Number.isInteger(fromIdx) && fromIdx !== idx) {
              const [moved] = s.section_order.splice(fromIdx, 1);
              s.section_order.splice(idx, 0, moved);
              sync();
              renderOrderCards();
              node._renderUI?.();
              fitNode(node);
              scheduleAlign(node);
            }
            draggedSectionIdx = null;
          };

          card.ondragend = () => {
            draggedSectionIdx = null;
            card.classList.remove("is-dragging");
            orderList.querySelectorAll(".ds-sensei-order-card").forEach((c) => c.classList.remove("is-dragover"));
          };

          orderList.appendChild(card);
        });
      };
      renderOrderCards();
      scrollBody.appendChild(orderList);

      // ── Built-In Behavior Settings
      const behBiLbl = document.createElement("div");
      behBiLbl.className = "ds-sensei-gear-section-label";
      behBiLbl.style.marginTop = "6px";
      behBiLbl.textContent = "Built-In LLM Options";
      scrollBody.appendChild(behBiLbl);

      const behBiBox = document.createElement("div");
      behBiBox.className = "ds-sensei-gear-behavior-box";

      const autoUnloadToggle = Toggle({
        label: "Auto-unload after prompt creation",
        checked: bi.auto_unload !== false,
        onChange: (checked) => {
          bi.auto_unload = checked;
          s.auto_unload = checked;
          sync();
        },
      });
      behBiBox.appendChild(autoUnloadToggle.root);

      const freeComfyToggle = Toggle({
        label: "Free ComfyUI models before loading",
        checked: bi.free_comfy_memory !== false,
        onChange: (checked) => {
          bi.free_comfy_memory = checked;
          sync();
        },
      });
      behBiBox.appendChild(freeComfyToggle.root);

      const cpuOnlyToggle = Toggle({
        label: "CPU Only mode (Force 0 GPU layers)",
        checked: Boolean(bi.cpu_only),
        onChange: (checked) => {
          bi.cpu_only = checked;
          sync();
        },
      });
      behBiBox.appendChild(cpuOnlyToggle.root);

      const randSeedBiToggle = Toggle({
        label: "Randomize seed each generation",
        checked: bi.randomize_seed !== false,
        onChange: (checked) => {
          bi.randomize_seed = checked;
          sync();
        },
      });
      behBiBox.appendChild(randSeedBiToggle.root);

      scrollBody.appendChild(behBiBox);

      // ── LM Studio Behavior Settings
      const behLmLbl = document.createElement("div");
      behLmLbl.className = "ds-sensei-gear-section-label";
      behLmLbl.style.marginTop = "6px";
      behLmLbl.textContent = "LM Studio Options";
      scrollBody.appendChild(behLmLbl);

      const behLmBox = document.createElement("div");
      behLmBox.className = "ds-sensei-gear-behavior-box";

      const randSeedLmToggle = Toggle({
        label: "Randomize seed each generation",
        checked: lm.randomize_seed !== false,
        onChange: (checked) => {
          lm.randomize_seed = checked;
          sync();
        },
      });
      behLmBox.appendChild(randSeedLmToggle.root);

      const unloadLmToggle = Toggle({
        label: "Unload LLM after run",
        checked: Boolean(lm.unload_after_run),
        onChange: (checked) => {
          lm.unload_after_run = checked;
          sync();
        },
      });
      behLmBox.appendChild(unloadLmToggle.root);

      scrollBody.appendChild(behLmBox);
    }
    requestAnimationFrame(adjustPopoverPos);
  };

  document.body.appendChild(popup);
  _activeSenseiGearPopup = popup;
  renderContent();
  adjustPopoverPos();
  requestAnimationFrame(adjustPopoverPos);

  // Auto-detect and populate loaded model if not set
  if (activeTab === "lm_studio" && !lm.model) {
    fetchLMStudioModels(lm.ip, lm.port).then((res) => {
      if (res.ok && res.models?.length > 0) {
        const llmModels = res.models.filter((m) => !/(embed|nomic-embed|bge-)/i.test(m));
        const activeModel = llmModels[0] || res.models[0];
        if (!lm.model && activeModel) {
          lm.model = activeModel;
          s.error_msg = null;
          sync();
          renderContent();
        }
      }
    });
  } else if (activeTab === "built_in" && !bi.model) {
    fetchBuiltinModels().then((res) => {
      if (res.ok && res.models?.length > 0) {
        bi.model = res.models[0].id;
        s.error_msg = null;
        sync();
        renderContent();
      }
    });
  }



  const onOutside = (e) => {
    if (e.target.closest?.(".ds-sensei-menu-popover")) return;
    if (!popup.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      closeSenseiGearConfig();
      document.removeEventListener("pointerdown", onOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside);
  }, 10);
}

function registerGearMenu() {
  if (!window.DSGearMenu?.register) return;
  const config = {
    tooltip: "DS AI Prompt Sensei Configuration",
    onClick: (node, canvas, event) => {
      openSenseiGearConfig(node, event?.currentTarget || event?.target);
    },
  };
  window.DSGearMenu.register(NODE_TYPE, config);
  window.DSGearMenu.register("DS AI Prompt Sensei", config);
}

function isLink(v) {
  return Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "number";
}

function buildConsumers(out) {
  const c = new Map();
  for (const id in out) for (const k in (out[id]?.inputs || {})) {
    const v = out[id].inputs[k]; if (!isLink(v)) continue;
    const origin = String(v[0]); if (!c.has(origin)) c.set(origin, new Set()); c.get(origin).add(String(id));
  }
  return c;
}

function collectDownstream(consumers, startId) {
  const seen = new Set(), stack = [String(startId)];
  while (stack.length) { const cur = stack.pop(); for (const n of (consumers.get(cur) || [])) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen;
}

async function resumeSenseiWorkflow(node) {
  try {
    if (typeof app.queuePrompt === "function") {
      await app.queuePrompt(0, 1);
    } else {
      const qBtn = document.getElementById("queue-button") || document.querySelector(".comfy-queue-btn");
      if (qBtn) qBtn.click();
    }
  } catch (e) {
    console.warn("[Sensei] app.queuePrompt failed, attempting fallback to queue button:", e);
    try {
      const qBtn = document.getElementById("queue-button") || document.querySelector(".comfy-queue-btn");
      if (qBtn) qBtn.click();
    } catch (_) { }
  }
}

let _senseiQueueWrapped = false;
let _isSenseiExecuting = false;

function installSenseiQueueHooks() {
  if (_senseiQueueWrapped) return;
  _senseiQueueWrapped = true;

  const triggerSenseiNodeUpdates = () => {
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        n._renderUI?.();
      }
    }
  };

  const onExecutionDone = () => {
    _isSenseiExecuting = false;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        if (n._sstate) {
          if (n._sstate.generated_prompt) {
            n._sstate.status = "completed";
          } else {
            n._sstate.status = "ready";
          }
          n._renderUI?.();
        }
      }
    }
    triggerSenseiNodeUpdates();
  };

  api.addEventListener("execution_start", () => {
    _isSenseiExecuting = true;
    triggerSenseiNodeUpdates();
  });
  api.addEventListener("execution_success", onExecutionDone);
  api.addEventListener("execution_error", onExecutionDone);
  api.addEventListener("execution_interrupted", onExecutionDone);
  api.addEventListener("executing", ({ detail }) => {
    _isSenseiExecuting = detail !== null;
    if (detail === null) onExecutionDone();
    else triggerSenseiNodeUpdates();
  });

  api.addEventListener("ds_sensei_executed", ({ detail }) => {
    if (!detail) return;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        if (detail.prompt) {
          n._sstate.generated_prompt = detail.prompt;
          if (detail.speed && detail.elapsed) {
            n._sstate.telemetry = {
              tokens: detail.tokens || n._sstate.telemetry?.tokens || 0,
              speed: detail.speed,
              elapsed: detail.elapsed,
              model: detail.model || n._sstate.telemetry?.model || "LM Studio"
            };
          }
          n._sstate.status = "completed";
          n._sstate.error_msg = null;
          n._syncState?.();
          n._renderUI?.();
        }
      }
    }
  });

  api.addEventListener("executed", ({ detail }) => {
    if (!detail) return;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if ((n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) && String(n.id) === String(detail.node)) {
        const promptText = detail.output?.prompt?.[0];
        if (promptText) {
          n._sstate.generated_prompt = promptText;
          const newSpeed = detail.output.speed?.[0];
          const newElapsed = detail.output.elapsed?.[0];
          if (newSpeed && newElapsed) {
            n._sstate.telemetry = {
              tokens: detail.output.tokens?.[0] || n._sstate.telemetry?.tokens || 0,
              speed: newSpeed,
              elapsed: newElapsed,
              model: detail.output.model?.[0] || n._sstate.telemetry?.model || "LM Studio"
            };
          }
          n._sstate.status = "completed";
          n._sstate.error_msg = null;
          n._livePromptStatus = null;
          n._syncState?.();
          n._renderUI?.();
        }
      }
    }
  });

  api.addEventListener("ds_sensei_progress", ({ detail }) => {
    if (!detail) return;
    const allNodes = app.graph?._nodes || app.graph?.nodes || [];
    for (const n of allNodes) {
      if (n.type === NODE_TYPE || n.comfyClass === NODE_TYPE) {
        n._livePromptStatus = detail.message;
        if (detail.tokens) {
          if (!n._sstate.telemetry) n._sstate.telemetry = {};
          n._sstate.telemetry.tokens = detail.tokens;
          if (detail.speed) n._sstate.telemetry.speed = detail.speed;
          if (detail.elapsed) n._sstate.telemetry.elapsed = detail.elapsed;
          if (detail.model) n._sstate.telemetry.model = detail.model;
        }
        if (detail.stage === "loading") {
          n._sstate.status = "generating";
        } else if (detail.stage === "completed" || detail.stage === "finished") {
          n._sstate.status = "completed";
        }
        n._updateLlmMonitor?.();
      }
    }
  });
}

function defaultState() {
  return {
    provider: "lm_studio",
    mode: "i2v",
    system_prompts: {
      i2v: DEFAULT_SYSTEM_PROMPTS.i2v,
      t2i: DEFAULT_SYSTEM_PROMPTS.t2i,
      t2v: DEFAULT_SYSTEM_PROMPTS.t2v,
    },
    notes_per_mode: {
      i2v: "",
      t2i: "",
      t2v: "",
    },
    custom_text: "",
    sys_prompt_expanded: false,
    image_path: "", image_dims: null, ar_source: "manual", img_expanded: false,
    prompt_height: null, notes_height: null,
    telemetry: { tokens: 0, speed: 0, elapsed: 0, model: "LM Studio" },
    hardware: null,
    lm_studio: {
      model: "",
      ip: "127.0.0.1",
      port: 1234,
      max_tokens: 2048,
      temperature: 0.7,
      seed: 123456,
      randomize_seed: true,
      timeout: 300,
      unload_after_run: false,
      pause_to_edit: false,
    },
    built_in: {
      model: "",
      temperature: 0.7,
      max_tokens: 2048,
      context_length: 8192,
      n_gpu_layers: 15,
      cpu_only: false,
      top_p: 0.95,
      top_k: 40,
      repetition_penalty: 1.1,
      seed: 123456,
      randomize_seed: true,
      auto_unload: true,
      free_comfy_memory: true,
      pause_to_edit: false,
    },
    gear_tab: "lm_studio",
    models: { model: "", video_vae: "", audio_vae: "", text_enc: "", clip_type: "auto", attention: "default" },
    loras: [{ name: "", strength: 1.0, enabled: true }],
    lora_expanded: false,
    collapsed: {
      image: false,
      models: false,
      lora: false,
      video: false,
      notes: false,
      prompt: false,
    },
    section_order: ["image", "models", "lora", "video", "notes", "prompt"],
    video: { aspect_ratio: "16:9", size_mode: "res", res_preset: "1280 × 720", mp_preset: 0.92, width: 1280, height: 720, mp: 0.92, duration: 5.0, fps: 24.0 },
    video_per_mode: {
      i2v: { aspect_ratio: "16:9", size_mode: "res", res_preset: "1280 × 720", mp_preset: 0.92, width: 1280, height: 720, mp: 0.92, duration: 5.0, fps: 24.0 },
      t2i: { aspect_ratio: "1:1", size_mode: "res", res_preset: "1024 × 1024 (1.05 MP - 1K)", mp_preset: 1.05, width: 1024, height: 1024, mp: 1.05, duration: 5.0, fps: 24.0 },
      t2v: { aspect_ratio: "16:9", size_mode: "res", res_preset: "1280 × 720", mp_preset: 0.92, width: 1280, height: 720, mp: 0.92, duration: 5.0, fps: 24.0 },
      custom: { aspect_ratio: "16:9", size_mode: "res", res_preset: "1280 × 720", mp_preset: 0.92, width: 1280, height: 720, mp: 0.92, duration: 5.0, fps: 24.0 },
    },
    scene_notes: "", system_prompt: DEFAULT_SYSTEM_PROMPTS.i2v, generated_prompt: "", auto_unload: false, status: "idle",
    error_msg: null,
  };
}

function isVueNodes() {
  return !!(
    window.LiteGraph?.vueNodesMode ||
    document.querySelector(".lg-node") ||
    document.querySelector(".vue-canvas")
  );
}

const SECTION_SLOTS = {
  image: [OUT.image],
  models: [OUT.model, OUT.video_vae, OUT.audio_vae, OUT.text_enc],
  lora: [],
  video: [OUT.width, OUT.height, OUT.duration, OUT.fps],
  notes: [],
  prompt: [OUT.prompt],
};

function getElementBounds(node, el) {
  const card = node._domCard || node._domRoot;
  if (!el || !card) return null;
  const w = node._senseiWidget;
  const widgetY = Number.isFinite(w?.y) ? w.y : (Number.isFinite(node.widgets_start_y) ? node.widgets_start_y : 2);
  const widgetMargin = Number.isFinite(w?.margin) ? w.margin : (w?.options?.margin ?? CARD_MARGIN);
  const scale = app.canvas?.ds?.scale || 1.0;
  if (scale <= 0) return null;

  const cardRect = card.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (!cardRect.height || !elRect.height) return null;

  const localTop = widgetY + widgetMargin + (elRect.top - cardRect.top) / scale;
  const localHeight = elRect.height / scale;
  return {
    top: localTop,
    height: localHeight,
    centerY: Math.round(localTop + localHeight * 0.5),
  };
}

function getElementCenterY(node, el) {
  const b = getElementBounds(node, el);
  return b ? b.centerY : null;
}

function alignOutputs(node) {
  if (!node || !node.outputs || !node._anchorEls) return;

  const nx = node.size[0];
  const isVue = isVueNodes();
  let nodeEl = null;
  let vueOuts = null;

  if (isVue) {
    nodeEl = document.querySelector(`.lg-node[data-node-id="${node.id}"]`);
    if (nodeEl) vueOuts = nodeEl.querySelectorAll(".lg-slot--output");
  }

  const s = node._sstate || {};
  const defaultOrder = ["image", "models", "lora", "video", "notes", "prompt"];
  const currentOrder = (Array.isArray(s.section_order) && s.section_order.length === 6)
    ? s.section_order
    : defaultOrder;

  const sectionCards = node._sectionCards || {};
  const slotTargetY = {};

  for (const secKey of currentOrder) {
    const cardEl = sectionCards[secKey];
    const slots = SECTION_SLOTS[secKey] || [];
    if (!slots.length) continue;

    const isCollapsed = Boolean(s.collapsed?.[secKey]);
    const cardHead = cardEl?.querySelector?.(".ds-ui-card-head") || cardEl;
    const b = cardHead ? getElementBounds(node, cardHead) : null;

    if (isCollapsed) {
      if (b && Number.isFinite(b.centerY)) {
        if (slots.length === 1) {
          slotTargetY[slots[0]] = b.centerY;
        } else {
          const count = slots.length;
          // Perfectly and symmetrically center multi-sockets within the 32px collapsed card row
          const spacing = 7;
          for (let k = 0; k < count; k++) {
            slotTargetY[slots[k]] = b.centerY + (k - (count - 1) / 2) * spacing;
          }
        }
      }
    } else {
      // Expanded
      if (slots.length === 1) {
        const slotIdx = slots[0];
        const el = node._anchorEls[slotIdx] || cardHead;
        const cy = el ? getElementCenterY(node, el) : (b ? b.centerY : null);
        if (Number.isFinite(cy)) slotTargetY[slotIdx] = cy;
      } else {
        // Multi-socket sections (models, settings)
        for (const slotIdx of slots) {
          const el = node._anchorEls[slotIdx];
          const cy = el ? getElementCenterY(node, el) : null;
          if (Number.isFinite(cy)) slotTargetY[slotIdx] = cy;
        }
      }
    }
  }

  // Sort slots by their assigned vertical position to prevent collisions without breaking section order
  const validSlots = Object.keys(slotTargetY)
    .map(Number)
    .filter((idx) => node.outputs[idx] && Number.isFinite(slotTargetY[idx]))
    .sort((a, b) => slotTargetY[a] - slotTargetY[b]);

  const MIN_GAP = 9;
  let lastY = -Infinity;
  let cluster = []; // slots squeezed together: { idx, orig }

  const flushCluster = () => {
    if (cluster.length > 1) {
      // Pushing only moves slots down, so center the stack on its original target
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      const origMid = (first.orig + last.orig) / 2;
      const newMid = (slotTargetY[first.idx] + slotTargetY[last.idx]) / 2;
      const shift = newMid - origMid;
      for (const { idx } of cluster) slotTargetY[idx] -= shift;
    }
    cluster = [];
  };

  for (const slotIdx of validSlots) {
    const orig = slotTargetY[slotIdx];
    let y = orig;
    if (y < lastY + MIN_GAP) {
      y = lastY + MIN_GAP;
    } else {
      flushCluster(); // gap found: the previous group is complete
    }
    cluster.push({ idx: slotIdx, orig });
    slotTargetY[slotIdx] = y;
    lastY = y;
  }
  flushCluster();

  let changed = false;
  for (let i = 0; i < 10; i++) {
    const out = node.outputs[i];
    if (!out) continue;

    let targetY = slotTargetY[i];
    if (!Number.isFinite(targetY)) {
      targetY = Number.isFinite(out.pos?.[1]) ? out.pos[1] : (40 + i * 20);
    }

    if (!out.pos || Math.abs(out.pos[0] - nx) > 0.5 || Math.abs(out.pos[1] - targetY) > 0.5) {
      out.pos = [nx, targetY];
      changed = true;
    }

    if (isVue && nodeEl && vueOuts && vueOuts[i]) {
      vueOuts[i].style.position = "absolute";
      vueOuts[i].style.right = "0px";
      vueOuts[i].style.top = `${targetY}px`;
      vueOuts[i].style.transform = "translateY(-50%)";
      vueOuts[i].style.pointerEvents = "auto";
    }
  }

  if (changed) {
    node.setDirtyCanvas?.(true, true);
  }
}

function getSenseiCards(node) {
  if (!node) return [];
  const root = node._domCard || node._domRoot;
  if (!root) return [];
  return Array.from(root.children || []).filter(
    (c) => c.classList?.contains("ds-ui-card") || c.classList?.contains("ds-sensei-card")
  );
}

function getCardsTotalHeight(node) {
  if (!node) return 0;
  const cards = getSenseiCards(node);
  let totalCardsH = 0;
  let count = 0;

  // The visible cards are the source of truth. Do not measure the DOM widget
  // host itself because ComfyUI's widget allocation includes its 5px margin
  // and can otherwise feed host height back into node sizing.
  for (const c of cards) {
    const ch = Math.ceil(c.offsetHeight || c.scrollHeight || 0);
    if (ch > 0) {
      totalCardsH += ch;
      count++;
    }
  }
  if (count > 1) totalCardsH += (count - 1) * 10;
  return totalCardsH;
}

function getFittedHeight(node) {
  if (!node) return DEFAULT_H;

  const widget = node._senseiWidget;
  const widgetY = Number.isFinite(widget?.y) && Number(widget.y) > 0
    ? Number(widget.y)
    : CARD_MARGIN;
  const widgetMargin = Number.isFinite(widget?.margin)
    ? Number(widget.margin)
    : CARD_MARGIN;
  const cardsBottom = getCardsTotalHeight(node);

  if (cardsBottom <= 50) {
    return Number(node.size?.[1]) || DEFAULT_H;
  }

  // Node base bottom = actual bottom of the card stack + exactly 5px.
  // The DOM widget's own 5px margin is accounted for above the card stack;
  // no extra invisible height is allowed to survive below the cards.
  return Math.ceil(widgetY + widgetMargin + cardsBottom + BOTTOM_GAP);
}

function fitNode(node) {
  if (!node) return;
  const targetH = getFittedHeight(node);
  const targetW = Math.max(MIN_W, Number(node.size?.[0]) || DEFAULT_W);

  if (!node.size || node.size[0] !== targetW || Math.abs(node.size[1] - targetH) > 1) {
    node._senseiFitting = true;
    try {
      if (typeof node.setSize === "function") {
        node.setSize([targetW, targetH]);
      } else {
        node.size = [targetW, targetH];
      }
      node.setDirtyCanvas?.(true, true);
    } finally {
      node._senseiFitting = false;
    }
  }
}

function scheduleFitNode(node) {
  if (!node || node._dsRemoved) return;
  if (node._dsFitTimer) clearTimeout(node._dsFitTimer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!node.graph || node._dsRemoved) return;
      fitNode(node);
      scheduleAlign(node);
    });
  });
  node._dsFitTimer = setTimeout(() => {
    node._dsFitTimer = null;
    if (!node.graph || node._dsRemoved) return;
    fitNode(node);
    scheduleAlign(node);
  }, 80);
}

function scheduleAlign(node) {
  if (!node || node._dsRemoved) return;
  const run = () => {
    if (!node.graph || node._dsRemoved) return;
    alignOutputs(node);
  };
  requestAnimationFrame(run);
  setTimeout(run, 80);
}

function watchAlign(node) {
  if (node._dsAlignPoll) return;
  node._dsAlignPoll = setInterval(() => {
    if (!node.graph || node._dsRemoved) {
      unwatchAlign(node);
      return;
    }
    alignOutputs(node);
  }, 300);
  scheduleAlign(node);
}

function unwatchAlign(node) {
  if (node?._dsAlignPoll) {
    clearInterval(node._dsAlignPoll);
    node._dsAlignPoll = null;
  }
}

// ---------------------------------------------------------------------------
// Build DOM UI
// ---------------------------------------------------------------------------

function mkrow(label) {
  const row = document.createElement("div"); row.className = "ds-sensei-row";
  if (label) { const l = document.createElement("span"); l.className = "ds-sensei-row-label"; l.textContent = label; row.appendChild(l); }
  return row;
}

function renderHW(container, s) {
  container.innerHTML = "";
  const hw = s.hardware; if (!hw?.has_gpu) return;
  const est = estimateVRAM(s.video.width, s.video.height, s.video.fps, s.video.duration, s.models.model);
  const avail = hw.available_vram_mb / 1024, total = hw.total_vram_mb / 1024;
  if (est > avail * 0.85) {
    const w = document.createElement("div"); w.className = "ds-sensei-hw-warning";
    w.innerHTML = `<span class="ds-sensei-hw-warning-icon">⚠</span><span class="ds-sensei-hw-warning-text">~${est.toFixed(1)} GB est — ${avail.toFixed(1)} / ${total.toFixed(1)} GB (${hw.gpu_name})</span>`;
    container.appendChild(w);
  } else {
    const ok = document.createElement("div"); ok.className = "ds-sensei-hw-ok";
    ok.textContent = `✓ ${hw.gpu_name} — ${avail.toFixed(1)} GB available`;
    container.appendChild(ok);
  }
}

function buildCard(node) {
  const container = document.createElement("div");
  container.className = "ds-sensei-container";
  container.dataset.dsThemed = "true";
  container.dataset.dsSenseiNode = "true";

  // The ComfyUI DOM widget owns the 5px node-edge margin. Do not add a second
  // 5px padding layer here; that would make the visible cards drift away from
  // the node edge and make the side spacing inconsistent.
  container.style.setProperty("padding", "0", "important");
  container.style.setProperty("margin", "0", "important");
  container.style.setProperty("width", "100%", "important");

  container.addEventListener("scroll", () => {
    scheduleAlign(node);
  }, { passive: true });

  const anchorEls = new Array(10).fill(null);

  const sync = () => {
    const s = node._sstate;
    const curNotes = container.querySelector(".ds-sensei-notes-area");
    if (curNotes && curNotes.style.height) {
      s.notes_height = curNotes.style.height;
    }
    const curPrompt = container.querySelector(".ds-sensei-prompt-area");
    if (curPrompt && curPrompt.style.height) {
      s.prompt_height = curPrompt.style.height;
    }
    const wgt = node.widgets?.find((w) => w.name === "SenseiState");
    const jsonStr = JSON.stringify(s);
    if (wgt) wgt.value = jsonStr;
    node.properties = node.properties || {};
    node.properties.ds_sensei_state = s;
    if (app.graph) {
      app.graph._version = (app.graph._version || 0) + 1;
      app.graph.setDirtyCanvas?.(true, true);
    }
  };
  node._syncState = sync;

  const rerender = () => {
    const curNotes = container.querySelector(".ds-sensei-notes-area");
    if (curNotes && curNotes.style.height) {
      node._sstate.notes_height = curNotes.style.height;
    }
    const curPrompt = container.querySelector(".ds-sensei-prompt-area");
    if (curPrompt && curPrompt.style.height) {
      node._sstate.prompt_height = curPrompt.style.height;
    }
    sync();

    node._senseiRo?.disconnect?.();
    container.innerHTML = "";
    buildInner(container, node, node._sstate, sync, rerender, anchorEls);
    try { window.DSGlobalTheme?.bindNode?.(container, node); } catch (_) { }
    scheduleFitNode(node);
    scheduleAlign(node);
  };
  node._renderUI = rerender;
  node._anchorEls = anchorEls;

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      // Card content changes need alignment, but resizing the DOM host must never
      // redefine the node's saved/natural height.
      scheduleAlign(node);
    });
    node._senseiRo = ro;
  }

  buildInner(container, node, node._sstate, sync, rerender, anchorEls);
  scheduleFitNode(node);
  return container;
}
const buildRoot = buildCard;

function addCollapsedBadge(card, text) {
  if (!text || !card?.head) return;
  const actionsGroup = card.head.querySelector(".ds-ui-card-actions");
  if (!actionsGroup) return;
  const badge = document.createElement("span");
  badge.className = "ds-sensei-collapsed-badge";
  badge.textContent = text;
  badge.title = text;
  actionsGroup.insertBefore(badge, actionsGroup.firstChild);
}

function buildInner(container, node, s, sync, rerender, anchorEls) {
  // ── CARD 1: IMAGE (slot 0)
  const isImageCollapsed = Boolean(s.collapsed?.image);
  const cardImage = Card({
    title: "IMAGE",
    icon: "image",
    collapsed: isImageCollapsed,
    className: "ds-sensei-card" + (isImageCollapsed ? " is-collapsed" : ""),
    actions: [
      {
        tooltip: isImageCollapsed ? "Expand Image & Monitor" : "Collapse Image & Monitor",
        icon: isImageCollapsed ? "chevron-down" : "chevron-up",
        onClick: () => {
          s.collapsed = s.collapsed || {};
          s.collapsed.image = !isImageCollapsed;
          sync();
          rerender();
        },
      },
    ],
  });

  const isImageIgnored = s.mode === "t2i" || s.mode === "t2v";

  const fileInp = document.createElement("input");
  fileInp.type = "file";
  fileInp.accept = "image/*";
  fileInp.style.display = "none";
  const handleFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    try {
      const r = await fetch("/upload/image", { method: "POST", body: fd });
      if (!r.ok) return;
      const d = await r.json();
      s.image_path = d.name;
      const img = new Image();
      img.onload = () => {
        s.image_dims = `${img.naturalWidth} × ${img.naturalHeight}`;
        const ar = findClosestAR(img.naturalWidth / img.naturalHeight);
        s.image_ar = ar;

        if (!s.video_per_mode) s.video_per_mode = {};

        if (s.mode === "i2v") {
          s.video.aspect_ratio = ar;
          s.ar_source = "locked";

          const origLabel = `Original (${img.naturalWidth} × ${img.naturalHeight})`;

          if (s.video.size_mode === "mp") {
            const targetMP = parseFloat(s.video.mp_preset || s.video.mp || 1.0);
            const dim = dimsFromMP(targetMP, ar);
            s.video.width = dim.w;
            s.video.height = dim.h;
            s.video.mp = targetMP;
            s.video.res_preset = "";
          } else {
            const wasOriginal = !s.video.res_preset || s.video.res_preset.startsWith("Original");
            if (wasOriginal) {
              s.video.width = img.naturalWidth;
              s.video.height = img.naturalHeight;
              s.video.res_preset = origLabel;
              s.video.mp = parseFloat(calcMP(img.naturalWidth, img.naturalHeight));
              s.video.mp_preset = s.video.mp;
            } else {
              const curMP = parseFloat(s.video.mp) || 1.0;
              const newPresets = LTX_PRESETS[ar] || LTX_PRESETS["16:9"];
              let closest = newPresets[0];
              let minDiff = Infinity;
              for (const p of newPresets) {
                const pMP = (p.w * p.h) / 1_000_000;
                const diff = Math.abs(pMP - curMP);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = p;
                }
              }
              s.video.width = closest.w;
              s.video.height = closest.h;
              s.video.res_preset = closest.label;
              s.video.mp = parseFloat(calcMP(closest.w, closest.h));
            }
          }
          s.video_per_mode["i2v"] = { ...s.video };
        } else {
          const i2vVid = s.video_per_mode["i2v"] || { ...s.video };
          i2vVid.aspect_ratio = ar;
          s.video_per_mode["i2v"] = i2vVid;
        }
        sync();
        rerender();
      };
      img.src = `/view?filename=${encodeURIComponent(d.name)}&type=${d.type || "input"}`;
    } catch (e) {
      console.error("[Sensei] Upload:", e);
    }
  };
  fileInp.onchange = (e) => handleFile(e.target.files[0]);

  if (isImageCollapsed) {
    const dims = s.image_dims || (s.image_path ? "Loaded" : "");
    if (dims) addCollapsedBadge(cardImage, dims);
    cardImage.append(fileInp);
    anchorEls[OUT.image] = cardImage.head || cardImage.root;
  } else {
    const splitRow = document.createElement("div");
    splitRow.className = "ds-sensei-image-split-row";

    // Left Column: Square Preview / Dropzone (Ultra Compact)
    const imgCol = document.createElement("div");
    imgCol.className = "ds-sensei-image-col" + (isImageIgnored ? " ds-sensei-image-col-ignored" : "");

    if (s.image_path) {
      const prevBox = document.createElement("div");
      prevBox.className = "ds-sensei-preview-square" + (isImageIgnored ? " ds-sensei-preview-ignored" : "");
      const imgEl = document.createElement("img");
      imgEl.className = "ds-sensei-preview-img";
      imgEl.onload = () => { scheduleFitNode(node); scheduleAlign(node); };
      imgEl.src = `/view?filename=${encodeURIComponent(s.image_path)}&type=input`;
      prevBox.appendChild(imgEl);
      if (isImageIgnored) {
        const ignBadge = document.createElement("div");
        ignBadge.className = "ds-sensei-preview-ignored-badge";
        ignBadge.innerHTML = `${DSIconMarkup("x", { size: 11 })}<span>Ignored in ${s.mode.toUpperCase()}</span>`;
        prevBox.appendChild(ignBadge);
      }
      prevBox.title = isImageIgnored ? `Image is ignored in ${s.mode.toUpperCase()} mode. Click to change.` : "Click to change image";
      prevBox.onclick = () => fileInp.click();
      imgCol.appendChild(prevBox);

      const rbar = document.createElement("div");
      rbar.className = "ds-sensei-img-actions-bar";
      const dspan = document.createElement("span");
      dspan.className = "ds-sensei-img-res-badge";
      dspan.textContent = s.image_dims || "Loaded";
      rbar.appendChild(dspan);

      const removeBtn = Button({
        label: "Remove",
        icon: "trash-2",
        size: "compact",
        variant: "danger",
        onClick: (e) => {
          e.stopPropagation();
          s.image_path = "";
          s.image_dims = null;
          s.image_ar = null;
          s.ar_source = "manual";
          if (s.mode === "i2v") {
            if (s.video.size_mode === "mp") {
              const targetMP = parseFloat(s.video.mp_preset || s.video.mp || 0.92);
              const dim = dimsFromMP(targetMP, s.video.aspect_ratio);
              s.video.width = dim.w;
              s.video.height = dim.h;
              s.video.res_preset = "";
              s.video.mp = targetMP;
            } else {
              const pList = LTX_PRESETS[s.video.aspect_ratio] || LTX_PRESETS["16:9"];
              const p = pList.find(x => x.label.includes("720p")) || pList[0];
              s.video.width = p.w;
              s.video.height = p.h;
              s.video.res_preset = p.label;
              s.video.mp = parseFloat(calcMP(p.w, p.h));
              s.video.mp_preset = s.video.mp;
            }
          }
          if (!s.video_per_mode) s.video_per_mode = {};
          s.video_per_mode[s.mode] = { ...s.video };
          sync();
          rerender();
        }
      });
      rbar.appendChild(removeBtn.root);
      imgCol.appendChild(rbar);
    } else {
      const dz = document.createElement("div");
      dz.className = "ds-sensei-dropzone-square" + (isImageIgnored ? " ds-sensei-dropzone-ignored" : "");
      if (isImageIgnored) {
        dz.innerHTML = `
          <div class="ds-sensei-dropzone-square-title ds-sensei-ignored-title">${DSIconMarkup("x", { size: 12 })}<span>Ignored in ${s.mode.toUpperCase()}</span></div>
          <div class="ds-sensei-dropzone-square-sub">Text mode active</div>
        `;
        dz.title = `Image input is ignored in ${s.mode.toUpperCase()} mode`;
      } else {
        dz.innerHTML = `
          <div class="ds-sensei-dropzone-square-title">${DSIconMarkup("upload", { size: 14 })}<span>Upload Image</span></div>
          <div class="ds-sensei-dropzone-square-sub">Click or drag & drop</div>
        `;
      }
      dz.onclick = () => fileInp.click();
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("drag-over"); };
      dz.ondragleave = () => dz.classList.remove("drag-over");
      dz.ondrop = (e) => {
        e.preventDefault();
        dz.classList.remove("drag-over");
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
      };
      imgCol.appendChild(dz);
    }
    anchorEls[OUT.image] = imgCol;

    // Right Column: Realtime Hardware Bars + Realtime LLM Performance Monitor (Ultra Compact)
    const monCol = document.createElement("div");
    monCol.className = "ds-sensei-monitor-col";

    // 1. LLM Performance Monitor Box (Clean single-line metrics strip)
    const llmBox = document.createElement("div");
    llmBox.className = "ds-sensei-llm-monitor-box";

    const isGen = node._isGeneratingPrompt || s.status === "generating";
    const statusText = isGen ? "Generating" : (s.status || "idle").toUpperCase();
    const statusClass = isGen ? "is-generating" : (s.status === "completed" ? "is-completed" : "is-idle");
    const activeModelName = (s.telemetry?.model || (s.provider === "built_in" ? (s.built_in?.model?.split(/[/\\]/).pop() || "Built In") : (s.lm_studio?.model || "LM Studio"))).replace(/\.gguf$/i, "");

    llmBox.innerHTML = `
      <div class="ds-sensei-llm-top-row">
        <span class="ds-sensei-llm-live-badge ${statusClass}">
          <span class="ds-sensei-llm-live-dot"></span>
          <span class="ds-sensei-llm-live-txt">${statusText}</span>
        </span>
        <span class="ds-sensei-llm-model-name" title="${activeModelName}">${activeModelName}</span>
      </div>
      <div class="ds-sensei-llm-metrics-strip">
        <div class="ds-sensei-llm-pill"><span class="ds-sensei-llm-pill-lbl">Tokens:</span><b class="ds-sensei-llm-pill-val" id="llm-tok-val">${s.telemetry?.tokens != null ? s.telemetry.tokens : "—"}</b></div>
        <div class="ds-sensei-llm-pill"><span class="ds-sensei-llm-pill-lbl">Speed:</span><b class="ds-sensei-llm-pill-val" id="llm-spd-val">${s.telemetry?.speed ? s.telemetry.speed + " Tk/s" : "—"}</b></div>
        <div class="ds-sensei-llm-pill"><span class="ds-sensei-llm-pill-lbl">Time:</span><b class="ds-sensei-llm-pill-val" id="llm-time-val">${s.telemetry?.elapsed ? s.telemetry.elapsed + "s" : "—"}</b></div>
      </div>
    `;
    monCol.appendChild(llmBox);

    // 2. 4 Realtime Hardware Bars (Compact Inline Rows)
    const hwBarsBox = document.createElement("div");
    hwBarsBox.className = "ds-sensei-hw-bars-box";
    hwBarsBox.innerHTML = `
      <div class="ds-sensei-hw-bar-row">
        <span class="ds-sensei-hw-bar-label">${DSIconMarkup("cpu", { size: 11 })} CPU</span>
        <div class="ds-sensei-hw-bar-track">
          <div class="ds-sensei-hw-bar-fill normal" id="hw-cpu-fill" style="width: 0%;"></div>
        </div>
        <span class="ds-sensei-hw-bar-val" id="hw-cpu-val">—</span>
      </div>
      <div class="ds-sensei-hw-bar-row">
        <span class="ds-sensei-hw-bar-label">${DSIconMarkup("memory-stick", { size: 11 })} RAM</span>
        <div class="ds-sensei-hw-bar-track">
          <div class="ds-sensei-hw-bar-fill normal" id="hw-ram-fill" style="width: 0%;"></div>
        </div>
        <span class="ds-sensei-hw-bar-val" id="hw-ram-val">—</span>
      </div>
      <div class="ds-sensei-hw-bar-row">
        <span class="ds-sensei-hw-bar-label">${DSIconMarkup("gpu", { size: 11 })} GPU</span>
        <div class="ds-sensei-hw-bar-track">
          <div class="ds-sensei-hw-bar-fill normal" id="hw-gpu-fill" style="width: 0%;"></div>
        </div>
        <span class="ds-sensei-hw-bar-val" id="hw-gpu-val">—</span>
      </div>
      <div class="ds-sensei-hw-bar-row">
        <span class="ds-sensei-hw-bar-label">${DSIconMarkup("memory-stick", { size: 11 })} VRAM</span>
        <div class="ds-sensei-hw-bar-track">
          <div class="ds-sensei-hw-bar-fill normal" id="hw-vram-fill" style="width: 0%;"></div>
        </div>
        <span class="ds-sensei-hw-bar-val" id="hw-vram-val">—</span>
      </div>
    `;
    monCol.appendChild(hwBarsBox);

    // 3. Quick Action Memory Buttons
    const memActions = document.createElement("div");
    memActions.className = "ds-sensei-mem-actions-row";
    memActions.innerHTML = `
      <button type="button" class="ds-sensei-mem-btn" id="btn-free-vram" title="Empty PyTorch CUDA cache">
        ${DSIconMarkup("trash-2", { size: 10 })}<span>Free VRAM</span>
      </button>
      <button type="button" class="ds-sensei-mem-btn" id="btn-unload-models" title="Unload models from VRAM and kill active LLM">
        ${DSIconMarkup("power", { size: 10 })}<span>Unload All</span>
      </button>
    `;
    monCol.appendChild(memActions);

    splitRow.append(imgCol, monCol);
    cardImage.append(splitRow, fileInp);

    const updateStats = (d) => {
      if (!d) return;
      const cpu = Math.max(0, Math.min(100, Number(d.cpu) || 0));
      const ram = Math.max(0, Math.min(100, Number(d.ram) || 0));
      const gpu = Math.max(0, Math.min(100, Number(d.gpu) || 0));
      const vramTotal = Number(d.vram_total_gb) || 0;
      const vramUsed = Number(d.vram_used_gb) || 0;
      const vram = vramTotal > 0 ? Math.max(0, Math.min(100, (vramUsed / vramTotal) * 100)) : 0;
      const getLvl = (v) => v >= 90 ? "critical" : v >= 75 ? "warning" : "normal";

      const cpuVal = monCol.querySelector("#hw-cpu-val");
      const cpuFill = monCol.querySelector("#hw-cpu-fill");
      if (cpuVal) cpuVal.textContent = `${cpu.toFixed(0)}%`;
      if (cpuFill) {
        cpuFill.style.width = `${cpu}%`;
        cpuFill.className = `ds-sensei-hw-bar-fill ${getLvl(cpu)}`;
      }

      const ramVal = monCol.querySelector("#hw-ram-val");
      const ramFill = monCol.querySelector("#hw-ram-fill");
      const rUsed = (Number(d.ram_used_gb) || 0).toFixed(1);
      const rTot = (Number(d.ram_total_gb) || 0).toFixed(1);
      if (ramVal) ramVal.textContent = `${rUsed}/${rTot}G (${ram.toFixed(0)}%)`;
      if (ramFill) {
        ramFill.style.width = `${ram}%`;
        ramFill.className = `ds-sensei-hw-bar-fill ${getLvl(ram)}`;
      }

      const gpuVal = monCol.querySelector("#hw-gpu-val");
      const gpuFill = monCol.querySelector("#hw-gpu-fill");
      const gTemp = d.gpu_temp != null ? `${Math.round(d.gpu_temp)}°C` : (d.gpu_available ? "Active" : "—");
      if (gpuVal) gpuVal.textContent = `${gTemp} · ${gpu.toFixed(0)}%`;
      if (gpuFill) {
        gpuFill.style.width = `${gpu}%`;
        gpuFill.className = `ds-sensei-hw-bar-fill ${getLvl(gpu)}`;
      }

      const vramVal = monCol.querySelector("#hw-vram-val");
      const vramFill = monCol.querySelector("#hw-vram-fill");
      const vUsed = vramUsed.toFixed(1);
      const vTot = vramTotal.toFixed(1);
      const vFree = (Number(d.vram_free_gb) || 0).toFixed(1);
      if (vramVal) vramVal.textContent = vramTotal > 0 ? `${vUsed}/${vTot}G (${vFree}G free)` : "VRAM N/A";
      if (vramFill) {
        vramFill.style.width = `${vram}%`;
        vramFill.className = `ds-sensei-hw-bar-fill ${getLvl(vram)}`;
      }
    };

    if (node._lastHwStats) {
      updateStats(node._lastHwStats);
    }

    if (node._senseiHwPollTimer) clearInterval(node._senseiHwPollTimer);
    const pollHw = async () => {
      if (node._dsRemoved) {
        if (node._senseiHwPollTimer) clearInterval(node._senseiHwPollTimer);
        return;
      }
      try {
        let res = await fetch("/ds/prompt_sensei/hw_stats", { cache: "no-store" });
        if (!res.ok) {
          res = await fetch("/ds/hardware_monitor/stats", { cache: "no-store" });
        }
        if (res.ok) {
          const d = await res.json();
          node._lastHwStats = d;
          updateStats(d);
          return;
        }
      } catch (_) { }

      try {
        const sysRes = await fetch("/system_stats", { cache: "no-store" });
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          const dev = sysData.devices?.[0] || {};
          const d = {
            cpu: sysData.system?.cpu_usage || 0,
            ram: sysData.system?.ram_total ? ((sysData.system.ram_total - sysData.system.ram_free) / sysData.system.ram_total) * 100 : 0,
            ram_used_gb: sysData.system?.ram_total ? (sysData.system.ram_total - sysData.system.ram_free) / (1024 ** 3) : 0,
            ram_total_gb: sysData.system?.ram_total ? sysData.system.ram_total / (1024 ** 3) : 0,
            gpu_available: Boolean(dev.vram_total),
            vram_used_gb: dev.vram_total ? (dev.vram_total - dev.vram_free) / (1024 ** 3) : 0,
            vram_total_gb: dev.vram_total ? dev.vram_total / (1024 ** 3) : 0,
            vram_free_gb: dev.vram_free ? dev.vram_free / (1024 ** 3) : 0,
            gpu: dev.vram_total ? Math.round(((dev.vram_total - dev.vram_free) / dev.vram_total) * 100) : 0,
          };
          node._lastHwStats = d;
          updateStats(d);
        }
      } catch (_) { }
    };
    pollHw();
    node._senseiHwPollTimer = setInterval(pollHw, 1200);

    const updateLlmUI = () => {
      const liveBadge = monCol.querySelector(".ds-sensei-llm-live-badge");
      const liveTxt = monCol.querySelector(".ds-sensei-llm-live-txt");
      const modelSpan = monCol.querySelector(".ds-sensei-llm-model-name");
      const tokVal = monCol.querySelector("#llm-tok-val");
      const spdVal = monCol.querySelector("#llm-spd-val");
      const timeVal = monCol.querySelector("#llm-time-val");

      const isGen = node._isGeneratingPrompt || s.status === "generating";
      const isLoad = isGen && (node._livePromptStage === "loading" || (node._livePromptStatus || "").toLowerCase().includes("loading"));
      const isComp = !isGen && (s.status === "completed" || s.status === "finished");
      const isFail = !isGen && s.status === "failed";
      const statusClass = isGen ? "is-generating" : (isComp ? "is-completed" : (isFail ? "is-failed" : "is-idle"));
      const statusText = isGen ? (isLoad ? "Loading" : "Generating") : (isFail ? "FAILED" : (isComp ? "COMPLETED" : (s.status || "idle").toUpperCase()));

      if (liveBadge) {
        liveBadge.className = `ds-sensei-llm-live-badge ${statusClass}`;
        liveBadge.title = node._livePromptStatus || (isGen ? (isLoad ? "Loading model into memory" : "Generating prompt") : (isFail ? (s.error_msg || "Generation failed") : (isComp ? "Generation completed" : "Idle")));
      }
      if (liveTxt) {
        liveTxt.textContent = statusText;
      }
      if (modelSpan) {
        const m = s.telemetry?.model || (s.provider === "built_in" ? (s.built_in?.model?.split(/[/\\]/).pop() || "Built In") : (s.lm_studio?.model || "LM Studio"));
        modelSpan.textContent = String(m).replace(/\.gguf$/i, "");
        modelSpan.title = String(m);
      }
      if (tokVal) tokVal.textContent = s.telemetry?.tokens != null ? String(s.telemetry.tokens) : "—";
      if (spdVal) spdVal.textContent = s.telemetry?.speed ? `${s.telemetry.speed} Tk/s` : "—";
      if (timeVal) timeVal.textContent = s.telemetry?.elapsed ? `${s.telemetry.elapsed}s` : "—";
    };
    node._updateLlmMonitor = updateLlmUI;
    updateLlmUI();

    const freeVramBtn = monCol.querySelector("#btn-free-vram");
    if (freeVramBtn) {
      freeVramBtn.onclick = async (e) => {
        e.stopPropagation();
        freeVramBtn.classList.add("is-active");
        freeVramBtn.innerHTML = `<span>Clearing...</span>`;
        try {
          let r = await fetch("/ds/prompt_sensei/hw_action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "free_vram" }),
          });
          if (!r.ok) {
            await fetch("/ds/hardware_monitor/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "free_vram" }),
            });
          }
        } catch (_) { }
        setTimeout(() => {
          pollHw();
          freeVramBtn.innerHTML = `<span>✓ Cleared</span>`;
        }, 200);
        setTimeout(() => {
          freeVramBtn.classList.remove("is-active");
          freeVramBtn.innerHTML = `${DSIconMarkup("trash-2", { size: 10 })}<span>Free VRAM</span>`;
        }, 1200);
      };
    }

    const unloadBtn = monCol.querySelector("#btn-unload-models");
    if (unloadBtn) {
      unloadBtn.onclick = async (e) => {
        e.stopPropagation();
        unloadBtn.classList.add("is-active");
        unloadBtn.innerHTML = `<span>Unloading...</span>`;
        try {
          let r = await fetch("/ds/prompt_sensei/hw_action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unload_models" }),
          });
          if (!r.ok) {
            await fetch("/ds/hardware_monitor/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "unload_models" }),
            });
          }
          await fetch("/ds/prompt_sensei/kill", { method: "POST" });
          try { await fetch("/ds/prompt_sensei/builtin/unload", { method: "POST" }); } catch (_) { }
        } catch (_) { }
        setTimeout(() => {
          pollHw();
          unloadBtn.innerHTML = `<span>✓ Unloaded</span>`;
        }, 250);
        setTimeout(() => {
          unloadBtn.classList.remove("is-active");
          unloadBtn.innerHTML = `${DSIconMarkup("power", { size: 10 })}<span>Unload All</span>`;
        }, 1200);
      };
    }
  }

  // ── CARD 2: MODELS (slots 1–4: model, video_vae, audio_vae, text_enc)
  const isModelsCollapsed = Boolean(s.collapsed?.models);
  const cardModels = Card({
    title: "MODELS",
    icon: "cpu",
    collapsed: isModelsCollapsed,
    className: "ds-sensei-card" + (isModelsCollapsed ? " is-collapsed" : ""),
    actions: [
      {
        tooltip: isModelsCollapsed ? "Expand Models" : "Collapse Models",
        icon: isModelsCollapsed ? "chevron-down" : "chevron-up",
        onClick: () => {
          s.collapsed = s.collapsed || {};
          s.collapsed.models = !isModelsCollapsed;
          sync();
          rerender();
        },
      },
    ],
  });
  if (isModelsCollapsed) {
    const mName = s.models?.model ? s.models.model.split(/[/\\]/).pop().replace(/\.[^.]+$/, "") : "Auto";
    addCollapsedBadge(cardModels, mName);
    anchorEls[OUT.model] = cardModels.head || cardModels.root;
    anchorEls[OUT.video_vae] = cardModels.head || cardModels.root;
    anchorEls[OUT.audio_vae] = cardModels.head || cardModels.root;
    anchorEls[OUT.text_enc] = cardModels.head || cardModels.root;
  } else {
    const CLIP_TYPE_OPTIONS = [
      "auto",
      "krea2",
      "ltxv",
      "wan",
      "flux",
      "sd3",
      "lumina2",
      "hunyuan_video",
      "mochi",
      "cogvideox",
      "qwen_image",
      "stable_diffusion",
    ];
    const mdefs = [
      { key: "model", label: "Model", cat: "models", slot: OUT.model },
      { key: "video_vae", label: "Video VAE", cat: "vaes", slot: OUT.video_vae },
      { key: "audio_vae", label: "Audio VAE", cat: "vaes", slot: OUT.audio_vae },
      { key: "text_enc", label: "Text Enc", cat: "clips", slot: OUT.text_enc },
      { key: "clip_type", label: "Clip Type", cat: "clip_types", slot: -1 },
      { key: "attention", label: "Attention", cat: "attentions", slot: -1 },
    ];
    mdefs.forEach((m) => {
      const row = mkrow(m.label);
      if (m.slot >= 0) anchorEls[m.slot] = row;
      const cur = s.models[m.key] || (m.key === "attention" ? "default" : (m.key === "clip_type" ? "auto" : "None"));
      let options = [];
      if (m.key === "clip_type") {
        options = CLIP_TYPE_OPTIONS;
      } else {
        options = (node._catalog?.[m.cat] || []).length > 0 ? node._catalog[m.cat] : [cur];
      }
      const dd = createCustomDropdown({
        value: cur,
        options,
        placeholder: `Select ${m.label}...`,
        onSelect: (v) => {
          s.models[m.key] = v;
          sync();
          rerender();
        },
      });
      if (m.key !== "clip_type" && !node._catalog?.[m.cat]) {
        getCatalog().then((cat) => {
          node._catalog = cat;
          if (cat[m.cat]) dd.setOptions(cat[m.cat]);
        });
      }
      dd.el.style.flex = "1";
      dd.el.style.minWidth = "0";
      row.appendChild(dd.el);
      cardModels.append(row);
    });
  }

  // ── CARD 3: LORA LOADER (Exact match with Generation Hub ss3)
  const isLoraCollapsed = Boolean(s.collapsed?.lora);
  const cardLoras = Card({
    title: `LORA (${(s.loras || []).length})`,
    icon: "layers",
    collapsed: isLoraCollapsed,
    className: "ds-sensei-card ds-sensei-lora-card" + (isLoraCollapsed ? " is-collapsed" : ""),
    actions: [
      {
        tooltip: isLoraCollapsed ? "Expand LoRAs" : "Collapse LoRAs",
        icon: isLoraCollapsed ? "chevron-down" : "chevron-up",
        onClick: () => {
          s.collapsed = s.collapsed || {};
          s.collapsed.lora = !isLoraCollapsed;
          sync();
          rerender();
        },
      },
    ],
  });

  if (isLoraCollapsed) {
    const activeCount = (s.loras || []).filter((l) => l.enabled && l.name).length;
    addCollapsedBadge(cardLoras, `${activeCount} active`);
  } else {
    if (!s.loras?.length) s.loras = [{ name: "", strength: 1.0, enabled: true, selectedTriggers: [] }];
    const lorasList = document.createElement("div");
    lorasList.className = "ds-sensei-loras-list";

    let draggedLoraIdx = null;

    (s.loras || []).forEach((row, idx) => {
      const loraRow = document.createElement("div");
      loraRow.className = "ds-sensei-lora-row" + (row.enabled !== false ? "" : " is-off");
      loraRow.draggable = true;

      const dragHandle = document.createElement("span");
      dragHandle.className = "ds-sensei-drag-handle";
      dragHandle.title = "Drag to reorder";
      dragHandle.appendChild(DSIcon("grip-vertical", { size: 14 }));

      const loraSelect = createCustomDropdown({
        value: row.name || "",
        options: node._catalog?.loras || (row.name ? [row.name] : []),
        placeholder: "Select LoRA...",
        onSelect: (val) => {
          if (row.name !== val) {
            row.name = val;
            row.selectedTriggers = [];
            sync();
            rerender();
          }
        },
      });

      if (!node._catalog?.loras) {
        getCatalog().then((cat) => {
          node._catalog = cat;
          if (cat.loras) loraSelect.setOptions(cat.loras);
        });
      }

      const curStr = Number.isFinite(row.strength) ? Number(row.strength) : 1.0;
      const stepper = mkStepper({
        value: curStr,
        min: -10.0,
        max: 10.0,
        step: 0.05,
        decimals: 2,
        width: "58px",
        className: "ds-sensei-lora-stepper",
        onChange: (val) => {
          row.strength = Math.round(val * 100) / 100;
          row.modelStrength = row.strength;
          row.clipStrength = row.strength;
          sync();
        },
      });

      const hasTriggers = Array.isArray(row.selectedTriggers) && row.selectedTriggers.length > 0;
      const infoBtn = Button({
        icon: "info",
        compact: true,
        className: "ds-sensei-lora-info-btn" + (hasTriggers ? " has-triggers" : ""),
        tooltip: hasTriggers
          ? `Selected triggers: ${row.selectedTriggers.join(", ")}`
          : "View CivitAI Trigger Words & Metadata",
        onClick: (e) => {
          e.stopPropagation();
          openCivitAIModal(node, row, infoBtn.root);
        },
      });

      const toggle = Toggle({
        checked: Boolean(row.enabled !== false),
        className: "ds-sensei-lora-toggle",
        onChange: (checked) => {
          row.enabled = checked;
          loraRow.classList.toggle("is-off", !checked);
          sync();
        },
      });

      const delBtn = Button({
        icon: "trash-2",
        compact: true,
        className: "ds-sensei-lora-del-btn",
        tooltip: "Delete LoRA",
        onClick: (e) => {
          e.stopPropagation();
          s.loras.splice(idx, 1);
          if (!s.loras.length) s.loras.push({ name: "", strength: 1.0, enabled: true, selectedTriggers: [] });
          sync();
          rerender();
        },
      });

      loraRow.ondragstart = (e) => {
        draggedLoraIdx = idx;
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", String(idx));
          e.dataTransfer.effectAllowed = "move";
        }
      };
      loraRow.ondragover = (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        loraRow.classList.add("is-dragover");
      };
      loraRow.ondragenter = (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
      };
      loraRow.ondragleave = (e) => {
        if (!loraRow.contains(e.relatedTarget)) {
          loraRow.classList.remove("is-dragover");
        }
      };
      loraRow.ondrop = (e) => {
        e.preventDefault();
        loraRow.classList.remove("is-dragover");
        let fromIdx = draggedLoraIdx;
        if (fromIdx == null && e.dataTransfer) {
          const parsed = parseInt(e.dataTransfer.getData("text/plain"), 10);
          if (Number.isInteger(parsed)) fromIdx = parsed;
        }
        if (Number.isInteger(fromIdx) && fromIdx !== idx) {
          const [moved] = s.loras.splice(fromIdx, 1);
          s.loras.splice(idx, 0, moved);
          sync();
          rerender();
        }
        draggedLoraIdx = null;
      };
      loraRow.ondragend = () => {
        draggedLoraIdx = null;
        lorasList.querySelectorAll(".ds-sensei-lora-row").forEach(r => r.classList.remove("is-dragover"));
      };

      loraRow.append(dragHandle, loraSelect.el, stepper.wrap || stepper.root, infoBtn.root, toggle.root, delBtn.root);
      lorasList.appendChild(loraRow);
    });
    cardLoras.append(lorasList);

    const addLoraBtn = Button({
      label: "+ ADD LORA",
      className: "ds-sensei-add-btn",
      onClick: () => {
        s.loras.push({ name: "", strength: 1.0, enabled: true, selectedTriggers: [] });
        sync();
        rerender();
      },
    });
    cardLoras.append(addLoraBtn.root);
  }

  // ── CARD 4: SETTINGS
  const isVideoCollapsed = Boolean(s.collapsed?.video);
  const isImageLocked = Boolean(s.image_path) && s.mode === "i2v";

  const videoCardActions = [];
  if (!isImageLocked) {
    videoCardActions.push({
      tooltip: "Swap Dimensions (Width & Height)",
      icon: "arrow-left-right",
      onClick: () => {
        const curW = s.video.width || 1280;
        const curH = s.video.height || 720;
        s.video.width = curH;
        s.video.height = curW;
        const flippedAR = findClosestAR(curH / curW);
        s.video.aspect_ratio = flippedAR;
        s.ar_source = "manual";
        if (s.video.size_mode === "res") {
          const pList = LTX_PRESETS[flippedAR] || LTX_PRESETS["16:9"];
          const matched = pList.find((p) => p.w === curH && p.h === curW);
          s.video.res_preset = matched ? matched.label : `${curH} × ${curW}`;
        }
        s.video.mp = parseFloat(calcMP(curH, curW));
        if (s.video.mp_preset) {
          s.video.mp_preset = s.video.mp;
        }
        if (!s.video_per_mode) s.video_per_mode = {};
        s.video_per_mode[s.mode] = { ...s.video };
        sync();
        rerender();
      },
    });
  }
  videoCardActions.push({
    tooltip: isVideoCollapsed ? "Expand Settings" : "Collapse Settings",
    icon: isVideoCollapsed ? "chevron-down" : "chevron-up",
    onClick: () => {
      s.collapsed = s.collapsed || {};
      s.collapsed.video = !isVideoCollapsed;
      sync();
      rerender();
    },
  });

  const cardVideo = Card({
    title: "SETTINGS",
    icon: "sliders",
    collapsed: isVideoCollapsed,
    className: "ds-sensei-card" + (isVideoCollapsed ? " is-collapsed" : ""),
    actions: videoCardActions,
  });

  if (isVideoCollapsed) {
    const fpsText = s.video.fps ? `${s.video.fps}fps` : "";
    const durText = s.video.duration ? `${s.video.duration}s` : "";
    const dimText = `${s.video.width || 1280} × ${s.video.height || 720}`;
    const preview = [dimText, durText, fpsText].filter(Boolean).join(" · ");
    addCollapsedBadge(cardVideo, preview);
    anchorEls[OUT.width] = cardVideo.head || cardVideo.root;
    anchorEls[OUT.height] = cardVideo.head || cardVideo.root;
    anchorEls[OUT.duration] = cardVideo.head || cardVideo.root;
    anchorEls[OUT.fps] = cardVideo.head || cardVideo.root;
  } else {
    // Aspect ratio (central dropdown)
    const arRow = mkrow("Aspect Ratio");
    const arDd = createCustomDropdown({
      value: s.video.aspect_ratio || "16:9",
      options: AR_LIST,
      disabled: isImageLocked,
      onSelect: (v) => {
        if (isImageLocked) return;
        s.video.aspect_ratio = v; s.ar_source = "manual";
        if (s.video.size_mode === "mp") {
          const targetMP = parseFloat(s.video.mp_preset || s.video.mp || 0.92);
          const dim = dimsFromMP(targetMP, v);
          s.video.width = dim.w;
          s.video.height = dim.h;
          s.video.res_preset = "";
          s.video.mp = targetMP;
        } else {
          const pList = LTX_PRESETS[v] || LTX_PRESETS["16:9"];
          const curMP = parseFloat(s.video.mp) || 0.92;
          let closest = pList[0];
          let minDiff = Infinity;
          for (const p of pList) {
            const pMP = (p.w * p.h) / 1_000_000;
            const diff = Math.abs(pMP - curMP);
            if (diff < minDiff) {
              minDiff = diff;
              closest = p;
            }
          }
          s.video.width = closest.w;
          s.video.height = closest.h;
          s.video.res_preset = closest.label;
          s.video.mp = parseFloat(calcMP(closest.w, closest.h));
        }
        if (!s.video_per_mode) s.video_per_mode = {};
        s.video_per_mode[s.mode] = { ...s.video };
        sync();
        rerender();
      },
    });
    arDd.el.style.flex = "1";
    arDd.el.style.minWidth = "0";
    if (isImageLocked) {
      arDd.el.title = "Aspect ratio is locked to the uploaded image in I2V mode.";
    }
    const arBadge = document.createElement("span");
    arBadge.className = `ds-sensei-ar-badge ${isImageLocked ? "auto" : (s.ar_source === "auto" ? "auto" : "manual")}`;
    arBadge.textContent = isImageLocked ? "🔒 Locked" : (s.ar_source === "auto" ? "Auto" : "Manual");
    if (isImageLocked) arBadge.title = "Aspect ratio is locked to the uploaded image in I2V mode";
    arRow.append(arDd.el, arBadge); cardVideo.append(arRow);

    // Size mode Res/MP
    const sizeRow = mkrow("Size");
    const seg = document.createElement("div"); seg.className = "ds-sensei-segmented";
    seg.append(
      mkBtn("Res", s.video.size_mode === "res" ? "active" : "", () => { s.video.size_mode = "res"; sync(); rerender(); }),
      mkBtn("MP", s.video.size_mode === "mp" ? "active" : "", () => { s.video.size_mode = "mp"; sync(); rerender(); })
    );

    let mpBadge = null;
    let mpSt = null;

    if (s.video.size_mode === "res") {
      const rawPresets = LTX_PRESETS[s.video.aspect_ratio] || LTX_PRESETS["16:9"];
      const origDims = (s.mode === "i2v") ? getOriginalDims(s) : null;
      let pList = [...rawPresets];
      if (origDims) {
        pList = [origDims, ...rawPresets.filter((p) => !(p.w === origDims.w && p.h === origDims.h))];
      }
      const currentPreset = pList.find((p) => p.label === s.video.res_preset || (p.w === s.video.width && p.h === s.video.height));
      const dispText = currentPreset?.label || (s.video.res_preset ? s.video.res_preset : `${s.video.width} × ${s.video.height}`);

      const resDd = createCustomDropdown({
        value: dispText,
        options: pList.map((p) => p.label),
        onSelect: (v) => {
          const found = pList.find((p) => p.label === v);
          if (found) {
            s.video.width = found.w;
            s.video.height = found.h;
            s.video.res_preset = found.label;
            s.video.mp = parseFloat(calcMP(found.w, found.h));
          }
          if (!s.video_per_mode) s.video_per_mode = {};
          s.video_per_mode[s.mode] = { ...s.video };
          sync();
          rerender();
        },
      });
      resDd.el.style.flex = "1";
      resDd.el.style.minWidth = "0";

      mpBadge = document.createElement("span");
      mpBadge.className = "ds-sensei-ar-badge manual";
      mpBadge.style.cssText = "font-variant-numeric: tabular-nums; min-width: 58px; text-align: center;";
      mpBadge.textContent = `${calcMP(s.video.width, s.video.height)} MP`;
      sizeRow.append(seg, resDd.el, mpBadge);
    } else {
      const curMP = parseFloat(s.video.mp || calcMP(s.video.width, s.video.height)) || 0.92;
      const dispMP = `${Number(s.video.mp_preset || curMP).toFixed(2)} MP`;
      const mpDd = createCustomDropdown({
        value: dispMP,
        options: MP_PRESETS.map((m) => m.label),
        onSelect: (v) => {
          const found = MP_PRESETS.find((m) => m.label === v);
          if (found) {
            s.video.mp_preset = found.mp;
            s.video.mp = found.mp;
            const d = dimsFromMP(found.mp, s.video.aspect_ratio);
            s.video.width = d.w;
            s.video.height = d.h;
            if (!s.video_per_mode) s.video_per_mode = {};
            s.video_per_mode[s.mode] = { ...s.video };
            sync();
            rerender();
          }
        },
      });
      mpDd.el.style.flex = "1";
      mpDd.el.style.minWidth = "0";

      mpSt = mkStepper({
        value: curMP,
        min: 0.1,
        max: 16.0,
        step: 0.05,
        decimals: 2,
        width: "78px",
        onChange: (v) => {
          if (!v || v <= 0) return;
          s.video.mp = v;
          s.video.mp_preset = v;
          const d = dimsFromMP(v, s.video.aspect_ratio);
          s.video.width = d.w;
          s.video.height = d.h;
          if (!s.video_per_mode) s.video_per_mode = {};
          s.video_per_mode[s.mode] = { ...s.video };
          sync();
          rerender();
        },
      });
      sizeRow.append(seg, mpDd.el, mpSt.wrap);
    }
    cardVideo.append(sizeRow);

    // Width (slot 5)
    const widthRow = mkrow("Width");
    anchorEls[OUT.width] = widthRow;
    const wSt = mkStepper({
      value: s.video.width || 1280, step: 32, min: 64, max: 8192, decimals: 0, width: "100%",
      onChange: (v) => {
        s.video.width = v;
        const newMP = parseFloat(calcMP(v, s.video.height));
        s.video.mp = newMP;
        if (mpBadge) mpBadge.textContent = `${newMP.toFixed(2)} MP`;
        if (mpSt) mpSt.setValue(newMP);
        if (!s.video_per_mode) s.video_per_mode = {};
        s.video_per_mode[s.mode] = { ...s.video };
        sync();
      },
    });
    widthRow.appendChild(wSt.wrap);
    cardVideo.append(widthRow);

    // Height (slot 6)
    const heightRow = mkrow("Height");
    anchorEls[OUT.height] = heightRow;
    const hSt = mkStepper({
      value: s.video.height || 720, step: 32, min: 64, max: 8192, decimals: 0, width: "100%",
      onChange: (v) => {
        s.video.height = v;
        const newMP = parseFloat(calcMP(s.video.width, v));
        s.video.mp = newMP;
        if (mpBadge) mpBadge.textContent = `${newMP.toFixed(2)} MP`;
        if (mpSt) mpSt.setValue(newMP);
        if (!s.video_per_mode) s.video_per_mode = {};
        s.video_per_mode[s.mode] = { ...s.video };
        sync();
      },
    });
    heightRow.appendChild(hSt.wrap);
    cardVideo.append(heightRow);

    const hwDiv = document.createElement("div"); hwDiv.className = "ds-sensei-hw-container";
    if (s.hardware) renderHW(hwDiv, s);
    cardVideo.append(hwDiv);

    // Duration (slot 7)
    const durRow = mkrow("Duration"); anchorEls[OUT.duration] = durRow;
    const dGrp = document.createElement("div"); dGrp.className = "ds-sensei-btn-group";
    DURATION_PRESETS.forEach((d) => dGrp.appendChild(mkBtn(String(d), s.video.duration === d ? "active" : "", () => {
      s.video.duration = d;
      if (!s.video_per_mode) s.video_per_mode = {};
      s.video_per_mode[s.mode] = { ...s.video };
      sync();
      rerender();
    })));
    const isCustomDur = !DURATION_PRESETS.includes(s.video.duration);
    const durSt = mkStepper({
      value: isCustomDur ? s.video.duration : "",
      placeholder: "Custom",
      fallbackValue: s.video.duration,
      step: 0.5,
      min: 0.5,
      decimals: 1,
      width: null,
      onChange: (v) => {
        if (v && v > 0) {
          s.video.duration = v;
          if (!s.video_per_mode) s.video_per_mode = {};
          s.video_per_mode[s.mode] = { ...s.video };
          sync();
          rerender();
        }
      }
    });
    if (isCustomDur) durSt.wrap.classList.add("active");
    dGrp.appendChild(durSt.wrap);
    durRow.appendChild(dGrp); cardVideo.append(durRow);

    // FPS (slot 8)
    const fpsRow = mkrow("FPS"); anchorEls[OUT.fps] = fpsRow;
    const fGrp = document.createElement("div"); fGrp.className = "ds-sensei-btn-group";
    FPS_PRESETS.forEach((f) => fGrp.appendChild(mkBtn(String(f), s.video.fps === f ? "active" : "", () => {
      s.video.fps = f;
      if (!s.video_per_mode) s.video_per_mode = {};
      s.video_per_mode[s.mode] = { ...s.video };
      sync();
      rerender();
    })));
    const isCustomFps = !FPS_PRESETS.includes(s.video.fps);
    const fpsSt = mkStepper({
      value: isCustomFps ? s.video.fps : "",
      placeholder: "Custom",
      fallbackValue: s.video.fps,
      step: 1,
      min: 1,
      decimals: 0,
      width: null,
      onChange: (v) => {
        if (v && v > 0) {
          s.video.fps = v;
          if (!s.video_per_mode) s.video_per_mode = {};
          s.video_per_mode[s.mode] = { ...s.video };
          sync();
          rerender();
        }
      }
    });
    if (isCustomFps) fpsSt.wrap.classList.add("active");
    fGrp.appendChild(fpsSt.wrap);
    fpsRow.appendChild(fGrp); cardVideo.append(fpsRow);

    // Hardware check
    let _hwTimer; clearTimeout(_hwTimer);
    _hwTimer = setTimeout(async () => { const hw = await getHW(); if (!hw) return; s.hardware = hw; sync(); renderHW(hwDiv, s); }, 600);
  }

  // ── CARD 5: SCENE NOTES / PROMPT WORKSPACE
  let notesTA = null;
  const isNotesCollapsed = Boolean(s.collapsed?.notes);
  const cardNotes = Card({
    title: s.mode === "custom" ? "PROMPT (CUSTOM)" : "PROMPT WORKSPACE",
    icon: s.mode === "custom" ? "edit-3" : "file-text",
    collapsed: isNotesCollapsed,
    className: "ds-sensei-card" + (isNotesCollapsed ? " is-collapsed" : ""),
    actions: [
      {
        icon: "trash-2",
        tooltip: s.mode === "custom" ? "Clear Custom Prompt" : "Clear Notes",
        onClick: () => {
          if (s.mode === "custom") {
            s.custom_text = "";
            s.generated_prompt = "";
          } else {
            s.scene_notes = "";
            if (!s.notes_per_mode) s.notes_per_mode = {};
            s.notes_per_mode[s.mode] = "";
          }
          sync();
          rerender();
        },
      },
      {
        tooltip: isNotesCollapsed ? "Expand Prompt Workspace" : "Collapse Prompt Workspace",
        icon: isNotesCollapsed ? "chevron-down" : "chevron-up",
        onClick: () => {
          s.collapsed = s.collapsed || {};
          s.collapsed.notes = !isNotesCollapsed;
          sync();
          rerender();
        },
      },
    ],
  });

  if (isNotesCollapsed) {
    const modeText = s.mode === "custom" ? "Custom" : (s.mode || "i2v").toUpperCase();
    addCollapsedBadge(cardNotes, modeText);
  } else {
    // 1. Provider Tabs Row
    const providerRow = document.createElement("div");
    providerRow.className = "ds-sensei-tabs-row ds-sensei-provider-tabs";
    if (s.mode === "custom") {
      providerRow.classList.add("ds-sensei-tabs-dimmed");
    }

    const lmBtn = document.createElement("button");
    lmBtn.type = "button";
    lmBtn.className = `ds-ui-btn ${s.provider === "lm_studio" ? "ds-ui-btn-primary" : "ds-ui-btn-secondary"}`;
    lmBtn.innerHTML = `${DSIconMarkup("server", { size: 13 })}<span>LM Studio</span>`;
    lmBtn.title = "Use external LM Studio server";
    lmBtn.onclick = () => {
      if (s.mode === "custom") return;
      s.provider = "lm_studio";
      sync();
      rerender();
    };

    const builtinBtn = document.createElement("button");
    builtinBtn.type = "button";
    builtinBtn.className = `ds-ui-btn ${s.provider === "built_in" ? "ds-ui-btn-primary" : "ds-ui-btn-secondary"}`;
    builtinBtn.innerHTML = `${DSIconMarkup("cpu", { size: 13 })}<span>Built In</span>`;
    builtinBtn.title = "Use internal LLM directly inside ComfyUI";
    builtinBtn.onclick = () => {
      if (s.mode === "custom") return;
      s.provider = "built_in";
      sync();
      rerender();
    };

    providerRow.append(lmBtn, builtinBtn);
    cardNotes.append(providerRow);

    // 2. Mode Tabs Row
    const modeRow = document.createElement("div");
    modeRow.className = "ds-sensei-tabs-row ds-sensei-mode-tabs";

    const modeDefs = [
      { id: "i2v", label: "I2V", icon: "film" },
      { id: "t2i", label: "T2I", icon: "image" },
      { id: "t2v", label: "T2V", icon: "video" },
      { id: "custom", label: "Custom", icon: "edit-3" },
    ];

    modeDefs.forEach((m) => {
      const mBtn = document.createElement("button");
      mBtn.type = "button";
      mBtn.className = `ds-ui-btn ${s.mode === m.id ? "ds-ui-btn-primary" : "ds-ui-btn-secondary"}`;
      mBtn.innerHTML = `${DSIconMarkup(m.icon, { size: 13 })}<span>${m.label}</span>`;
      mBtn.onclick = () => {
        // Save current input before tab switch
        if (s.mode === "custom") {
          if (notesTA && notesTA.value !== undefined) {
            s.custom_text = notesTA.value;
            s.generated_prompt = notesTA.value;
          }
        } else {
          if (notesTA && notesTA.value !== undefined) {
            if (!s.notes_per_mode) s.notes_per_mode = {};
            s.notes_per_mode[s.mode] = notesTA.value;
            s.scene_notes = notesTA.value;
          }
        }

        if (!s.video_per_mode) s.video_per_mode = {};
        s.video_per_mode[s.mode] = { ...(s.video || {}) };
        s.mode = m.id;

        // Restore video settings for new mode if available
        if (s.video_per_mode && s.video_per_mode[m.id]) {
          s.video = { ...s.video_per_mode[m.id] };
        } else {
          if (!s.video_per_mode) s.video_per_mode = {};
          if (m.id === "t2i") {
            s.video = { ...(s.video || {}), aspect_ratio: "1:1", width: 1024, height: 1024, res_preset: "1024 × 1024 (1.05 MP - 1K)" };
          } else {
            s.video = { ...(s.video || {}) };
          }
          s.video_per_mode[m.id] = { ...s.video };
        }

        // Enforce lock in i2v if image exists, unlock in other modes
        if (m.id === "i2v" && s.image_path) {
          if (s.image_dims) {
            const parts = s.image_dims.split(/[\s×x*]+/).map(Number).filter(Boolean);
            if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
              s.video.aspect_ratio = findClosestAR(parts[0] / parts[1]);
              s.ar_source = "locked";
            }
          }
        } else if (m.id !== "i2v") {
          s.ar_source = "manual";
        }

        if (m.id === "custom") {
          s.scene_notes = s.custom_text || "";
        } else {
          if (!s.notes_per_mode) s.notes_per_mode = {};
          s.scene_notes = s.notes_per_mode[m.id] || "";
          if (!s.system_prompts) s.system_prompts = { ...DEFAULT_SYSTEM_PROMPTS };
          s.system_prompt = s.system_prompts[m.id] || DEFAULT_SYSTEM_PROMPTS[m.id];
        }
        sync();
        rerender();
        fitNode(node);
        scheduleAlign(node);
      };
      modeRow.append(mBtn);
    });
    cardNotes.append(modeRow);

    // 3. Status Line
    const statusLine = document.createElement("div");
    statusLine.className = "ds-sensei-status-line";
    if (s.mode === "custom") {
      statusLine.textContent = "🟢 Custom Mode · LLM bypassed · Pass-through prompt";
    } else if (s.provider === "built_in") {
      const biModel = s.built_in?.model ? s.built_in.model.split(/[/\\]/).pop().replace(/\.gguf$/i, "") : "Auto";
      const imgNote = (s.mode !== "i2v" && s.image_path) ? " · (Image ignored in text mode)" : "";
      statusLine.textContent = `🧠 Built In (${biModel}) · Mode: ${s.mode.toUpperCase()}${imgNote}`;
    } else {
      const modelName = s.lm_studio?.model || "None selected";
      const imgNote = (s.mode !== "i2v" && s.image_path) ? " · (Image ignored in text mode)" : "";
      statusLine.textContent = `⚡ LM Studio (${modelName}) · Mode: ${s.mode.toUpperCase()}${imgNote}`;
    }
    cardNotes.append(statusLine);

    // 4. Notes / Custom Prompt Textarea
    notesTA = document.createElement("textarea");
    notesTA.className = "ds-sensei-textarea ds-sensei-notes-area";
    if (s.mode === "custom") {
      notesTA.placeholder = "Write or paste your custom prompt here. Passes through to the prompt output unchanged without using an LLM.";
      notesTA.value = s.custom_text || s.generated_prompt || s.scene_notes || "";
    } else {
      notesTA.placeholder = s.mode === "i2v"
        ? "Describe what you want. Uploaded image is analyzed automatically."
        : "Describe the scene idea in detail...";
      notesTA.value = s.notes_per_mode?.[s.mode] || s.scene_notes || "";
    }
    if (s.notes_height) notesTA.style.height = s.notes_height;
    notesTA.oninput = () => {
      if (s.mode === "custom") {
        s.custom_text = notesTA.value;
        s.generated_prompt = notesTA.value;
      } else {
        if (!s.notes_per_mode) s.notes_per_mode = {};
        s.notes_per_mode[s.mode] = notesTA.value;
        s.scene_notes = notesTA.value;
      }
      sync();
    };

    let _skipNotesInit = true;
    if (window.ResizeObserver) {
      const notesRo = new ResizeObserver(() => {
        if (_skipNotesInit) {
          _skipNotesInit = false;
          return;
        }
        if (notesTA.style.height && notesTA.style.height !== s.notes_height) {
          s.notes_height = notesTA.style.height;
          sync();
          fitNode(node);
          scheduleAlign(node);
        }
      });
      notesRo.observe(notesTA);
    }

    notesTA.addEventListener("pointerdown", () => {
      const onEnd = () => {
        window.removeEventListener("pointerup", onEnd, true);
        window.removeEventListener("mouseup", onEnd, true);
        if (notesTA.style.height && notesTA.style.height !== s.notes_height) {
          s.notes_height = notesTA.style.height;
          sync();
          fitNode(node);
          scheduleAlign(node);
        }
      };
      window.addEventListener("pointerup", onEnd, true);
      window.addEventListener("mouseup", onEnd, true);
    });
    cardNotes.append(notesTA);

    // 5. Action Row
    const notesBar = document.createElement("div");
    notesBar.className = "ds-sensei-notes-actions";
    notesBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin-top:4px;";

    const leftBtns = document.createElement("div");
    leftBtns.className = "ds-sensei-notes-actions-left";
    leftBtns.style.cssText = "display:flex;align-items:center;gap:6px;";

    const sysBtn = Button({
      label: "System Prompt",
      icon: "terminal",
      size: "compact",
      onClick: () => {
        const activeMode = s.mode === "custom" ? "i2v" : s.mode;
        openSysPromptModal(
          s.system_prompts?.[activeMode] || s.system_prompt || DEFAULT_SYSTEM_PROMPTS[activeMode],
          (v) => {
            if (!s.system_prompts) s.system_prompts = { ...DEFAULT_SYSTEM_PROMPTS };
            s.system_prompts[activeMode] = v;
            s.system_prompt = v;
            sync();
          },
          activeMode
        );
      },
    });

    const killBtn = Button({
      label: "Kill LLM",
      icon: "power",
      size: "compact",
      variant: "danger",
      onClick: async () => {
        try {
          await fetch("/ds/prompt_sensei/kill", { method: "POST" });
          s.status = "cancelled";
          sync();
          rerender();
        } catch (_) { }
      },
    });
    leftBtns.append(sysBtn.root, killBtn.root);

    const isAutoUnload = s.provider === "built_in"
      ? Boolean(s.built_in?.auto_unload !== false)
      : Boolean(s.lm_studio?.unload_after_run ?? s.auto_unload);
    const autoUnloadToggle = Toggle({
      label: "Auto Unload",
      checked: isAutoUnload,
      className: "ds-sensei-auto-unload-toggle",
      onChange: (checked) => {
        s.auto_unload = checked;
        if (!s.lm_studio) s.lm_studio = { ...defaultState().lm_studio };
        s.lm_studio.unload_after_run = checked;
        if (!s.built_in) s.built_in = { ...defaultState().built_in };
        s.built_in.auto_unload = checked;
        sync();
      },
    });

    notesBar.append(leftBtns, autoUnloadToggle.root);
    cardNotes.append(notesBar);
  }

  // ── CARD 6: GENERATED PROMPT (slot 9)
  let promptTA = null;
  const isPromptCollapsed = Boolean(s.collapsed?.prompt);
  const cardPrompt = Card({
    title: "GENERATED PROMPT",
    icon: "sparkles",
    collapsed: isPromptCollapsed,
    className: "ds-sensei-card" + (isPromptCollapsed ? " is-collapsed" : ""),
    actions: [
      {
        icon: "copy",
        tooltip: "Copy Prompt to Clipboard",
        onClick: async () => {
          if (s.generated_prompt) {
            try { await navigator.clipboard.writeText(s.generated_prompt); } catch (_) { }
          }
        }
      },
      {
        icon: "trash-2",
        tooltip: "Clear Prompt",
        onClick: () => { s.generated_prompt = ""; sync(); rerender(); }
      },
      {
        tooltip: isPromptCollapsed ? "Expand Generated Prompt" : "Collapse Generated Prompt",
        icon: isPromptCollapsed ? "chevron-down" : "chevron-up",
        onClick: () => {
          s.collapsed = s.collapsed || {};
          s.collapsed.prompt = !isPromptCollapsed;
          sync();
          rerender();
        }
      }
    ]
  });

  const wordCount = (s.generated_prompt || "").trim().split(/\s+/).filter(Boolean).length;
  const wcBadge = document.createElement("span");
  wcBadge.className = "ds-sensei-word-count";
  wcBadge.textContent = `${wordCount} words`;

  const promptActions = cardPrompt.head?.querySelector(".ds-ui-card-actions");
  if (promptActions) {
    promptActions.insertBefore(wcBadge, promptActions.firstChild);
  }

  if (s.image_path && s.mode === "i2v") {
    const ind = document.createElement("span"); ind.className = "ds-sensei-img-prompt-indicator"; ind.textContent = "🖼 Image-informed";
    cardPrompt.head?.querySelector(".ds-ui-card-title-group")?.appendChild(ind);
  }

  if (isPromptCollapsed) {
    anchorEls[OUT.prompt] = cardPrompt.head || cardPrompt.root;
  } else {
    anchorEls[OUT.prompt] = cardPrompt.head || cardPrompt.root;

    // Error Banner
    if (s.error_msg) {
      const errBox = document.createElement("div");
      errBox.className = "ds-sensei-error-banner";
      const parts = String(s.error_msg).split("\n");
      const errTitle = parts[0] || "Generation Error";
      const errSub = parts.slice(1).join("\n");

      const errTextDiv = document.createElement("div");
      errTextDiv.className = "ds-sensei-error-text";
      errTextDiv.innerHTML = `<strong>⚠️ ${errTitle}</strong>${errSub ? `<span class="ds-sensei-error-sub">${errSub}</span>` : ""}`;
      errBox.appendChild(errTextDiv);

      const errActions = document.createElement("div");
      errActions.className = "ds-sensei-error-actions";

      if (errTitle.includes("LM Studio unavailable")) {
        const startBtn = Button({
          label: "Start Server",
          icon: "play",
          size: "compact",
          variant: "primary",
          onClick: async () => {
            startBtn.setLabel("Starting...");
            startBtn.setDisabled(true);
            try {
              const r = await fetch("/ds/prompt_sensei/start_lm_server", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ port: s.lm_studio?.port || 1234 }),
              });
              const d = await r.json();
              if (d.ok) {
                s.error_msg = null;
                await fetchLMStudioModels(s.lm_studio?.ip, s.lm_studio?.port);
              } else {
                s.error_msg = `LM Studio start failed\n${d.message || d.error || "Please launch LM Studio manually"}`;
              }
            } catch (e) {
              s.error_msg = `Error starting server\n${e?.message}`;
            }
            sync();
            rerender();
          },
        });

        const retryBtn = Button({
          label: "Retry Connection",
          icon: "rotate-cw",
          size: "compact",
          onClick: async () => {
            const res = await fetchLMStudioModels(s.lm_studio?.ip, s.lm_studio?.port);
            if (res.ok) {
              s.error_msg = null;
            }
            sync();
            rerender();
          },
        });
        errActions.append(startBtn.root, retryBtn.root);
      } else if (errTitle.includes("Model unavailable")) {
        const gearBtn = Button({
          label: "Settings",
          icon: "settings",
          size: "compact",
          onClick: (e) => {
            openSenseiGearConfig(node, e.currentTarget || errBox);
          },
        });
        const reloadBtn = Button({
          label: "Reload Models",
          icon: "rotate-cw",
          size: "compact",
          onClick: async () => {
            const res = await fetchLMStudioModels(s.lm_studio?.ip, s.lm_studio?.port);
            if (res.ok && s.lm_studio?.model && res.models?.includes(s.lm_studio.model)) {
              s.error_msg = null;
            }
            sync();
            rerender();
          },
        });
        errActions.append(gearBtn.root, reloadBtn.root);
      } else {
        const dismissBtn = Button({
          label: "Dismiss",
          icon: "x",
          size: "compact",
          onClick: () => {
            s.error_msg = null;
            sync();
            rerender();
          },
        });
        errActions.appendChild(dismissBtn.root);
      }
      errBox.appendChild(errActions);
      cardPrompt.append(errBox);
    }

    promptTA = document.createElement("textarea");
    promptTA.className = "ds-sensei-textarea ds-sensei-prompt-area";
    promptTA.placeholder = "Generated prompt. Edit freely before clicking Continue.";
    promptTA.value = s.generated_prompt || "";
    if (s.prompt_height) promptTA.style.height = s.prompt_height;
    promptTA.oninput = () => {
      s.generated_prompt = promptTA.value;
      sync();
      const count = (s.generated_prompt || "").trim().split(/\s+/).filter(Boolean).length;
      wcBadge.textContent = `${count} words`;
    };

    let _skipPromptInit = true;
    if (window.ResizeObserver) {
      const promptRo = new ResizeObserver(() => {
        if (_skipPromptInit) {
          _skipPromptInit = false;
          return;
        }
        if (promptTA.style.height && promptTA.style.height !== s.prompt_height) {
          s.prompt_height = promptTA.style.height;
          sync();
          fitNode(node);
          scheduleAlign(node);
        }
      });
      promptRo.observe(promptTA);
    }

    promptTA.addEventListener("pointerdown", () => {
      const onEnd = () => {
        window.removeEventListener("pointerup", onEnd, true);
        window.removeEventListener("mouseup", onEnd, true);
        if (promptTA.style.height && promptTA.style.height !== s.prompt_height) {
          s.prompt_height = promptTA.style.height;
          sync();
          fitNode(node);
          scheduleAlign(node);
        }
      };
      window.addEventListener("pointerup", onEnd, true);
      window.addEventListener("mouseup", onEnd, true);
    });
    cardPrompt.append(promptTA);

    const actRow = document.createElement("div");
    actRow.style.cssText = "display:flex;gap:8px;width:100%;margin-top:4px;";
    const isExecutingWorkflow = _isSenseiExecuting || s.status === "generating";

    const rerollBtn = Button({
      label: s.status === "generating" ? "Generating..." : (s.mode === "custom" ? "Sync Prompt" : "Reroll"),
      icon: "rotate-cw",
      size: "compact",
      disabled: s.status === "generating",
      className: "ds-sensei-btn-reroll",
      onClick: async () => {
        if (s.mode === "custom") {
          s.generated_prompt = s.custom_text || (promptTA ? promptTA.value.trim() : "");
          s.status = "completed";
          s.error_msg = null;
          sync();
          rerender();
          return;
        }
        _activeSenseiNode = node;
        node._isGeneratingPrompt = true;
        s.status = "generating";
        s.error_msg = null;
        if (s.provider === "built_in") {
          if (s.built_in?.randomize_seed !== false) {
            s.built_in.seed = Math.floor(Math.random() * 2147483647);
          }
        } else {
          if (s.lm_studio?.randomize_seed !== false) {
            s.lm_studio.seed = Math.floor(Math.random() * 2147483647);
          }
        }
        sync();
        node._updateLlmMonitor?.();
        rerollBtn.setDisabled(true);
        rerollBtn.setLabel("Generating...");
        try {
          const isBuiltIn = s.provider === "built_in";
          const r = await fetch("/ds/prompt_sensei/generate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: s.mode || "i2v",
              provider: s.provider || "lm_studio",
              custom_text: s.custom_text || "",
              scene_notes: s.notes_per_mode?.[s.mode] || s.scene_notes || "",
              system_prompt: s.system_prompts?.[s.mode] || s.system_prompt || "",
              system_prompts: s.system_prompts,
              image_path: s.mode === "i2v" ? s.image_path : null,
              auto_unload: isBuiltIn
                ? Boolean(s.built_in?.auto_unload !== false)
                : Boolean(s.lm_studio?.unload_after_run ?? s.auto_unload),
              lm_studio: s.lm_studio,
              built_in: s.built_in,
              context: {
                aspect_ratio: s.video.aspect_ratio,
                width: s.video.width,
                height: s.video.height,
                duration: s.video.duration,
                fps: s.video.fps,
                models: s.models,
                has_image: Boolean(s.image_path && s.mode === "i2v")
              }
            }),
          });
          if (r.ok) {
            const d = await r.json();
            if (d.status === "cancelled") {
              s.status = "cancelled";
            } else if (d.status === "failed") {
              s.status = "failed";
              s.error_msg = d.error || "Generation failed";
            } else {
              s.generated_prompt = composePromptWithTriggers(d.prompt || "", s.loras);
              s.status = "completed";
              s.error_msg = null;
              if (d.seed !== undefined && d.seed !== null) {
                if (isBuiltIn) {
                  if (s.built_in) s.built_in.seed = d.seed;
                } else {
                  if (s.lm_studio) s.lm_studio.seed = d.seed;
                }
              }
              s.telemetry = {
                tokens: d.tokens || 0,
                speed: d.speed || 0,
                elapsed: d.elapsed || 0,
                model: d.model || (isBuiltIn ? (s.built_in?.model?.split(/[/\\]/).pop() || "Built In") : (s.lm_studio?.model || "LM Studio"))
              };
            }
          } else {
            s.status = "failed";
            s.error_msg = "Server error generating prompt";
          }
        } catch (e) {
          s.status = "failed";
          s.error_msg = e?.message || "Generation error";
        } finally {
          node._isGeneratingPrompt = false;
          rerollBtn.setDisabled(false);
          rerollBtn.setLabel(s.mode === "custom" ? "Sync Prompt" : "Reroll");
          sync();
          node._updateLlmMonitor?.();
          rerender();
        }
      }
    });
    rerollBtn.root.style.cssText = "flex:1;min-width:0;height:32px;font-size:12px;";

    const continueBtn = Button({
      label: isExecutingWorkflow ? "Abort" : (s.mode === "custom" ? "Continue (Custom)" : "Continue"),
      icon: isExecutingWorkflow ? "square" : "play",
      size: "compact",
      variant: isExecutingWorkflow ? "danger" : "primary",
      tooltip: isExecutingWorkflow ? "Stop the running ComfyUI workflow and LLM generation" : "Apply edited prompt and continue workflow",
      className: isExecutingWorkflow ? "ds-sensei-btn-danger" : "ds-sensei-btn-continue",
      onClick: async () => {
        if (isExecutingWorkflow) {
          continueBtn.setDisabled(true);
          continueBtn.setLabel("Aborting...");
          try { await fetch("/interrupt", { method: "POST" }); } catch (_) { }
          try { await fetch("/ds/prompt_sensei/kill", { method: "POST" }); } catch (_) { }
          _isSenseiExecuting = false;
          s.status = "cancelled";
          sync();
          node._updateLlmMonitor?.();
          rerender();
        } else {
          continueBtn.setDisabled(true);
          const origText = s.mode === "custom" ? "Continue (Custom)" : "Continue";
          continueBtn.setLabel("Queueing...");
          try {
            if (s.mode === "custom") {
              s.custom_text = (promptTA ? promptTA.value.trim() : "") || s.custom_text;
              s.generated_prompt = s.custom_text;
            } else {
              if (promptTA) s.generated_prompt = promptTA.value.trim();
              if (notesTA && notesTA.value !== undefined) {
                if (!s.notes_per_mode) s.notes_per_mode = {};
                s.notes_per_mode[s.mode] = notesTA.value;
                s.scene_notes = notesTA.value;
              }
            }
            if (promptTA && promptTA.style.height) s.prompt_height = promptTA.style.height;
            sync();
            app.graph?.setDirtyCanvas?.(true, true);
            await resumeSenseiWorkflow(node);
          } catch (e) {
            console.error("[Sensei] Continue button error:", e);
          } finally {
            setTimeout(() => {
              continueBtn.setDisabled(false);
              continueBtn.setLabel(origText);
            }, 800);
          }
        }
      }
    });
    continueBtn.root.style.cssText = "flex:1;min-width:0;height:32px;font-size:12px;";

    actRow.append(rerollBtn.root, continueBtn.root);
    cardPrompt.append(actRow);
  }

  // ── Append Cards According to Section Order
  const sectionCards = {
    image: cardImage.root,
    models: cardModels.root,
    lora: cardLoras.root,
    video: cardVideo.root,
    notes: cardNotes.root,
    prompt: cardPrompt.root,
  };
  node._sectionCards = sectionCards;

  const defaultOrder = ["image", "models", "lora", "video", "notes", "prompt"];
  const currentOrder = (Array.isArray(s.section_order) && s.section_order.length === 6)
    ? s.section_order
    : defaultOrder;

  currentOrder.forEach((secKey) => {
    const cardEl = sectionCards[secKey];
    if (cardEl) {
      container.appendChild(cardEl);
      if (node._senseiRo) {
        node._senseiRo.observe(cardEl);
      }
    }
  });
}

let _senseiProgressRegistered = false;
function registerSenseiProgressListener() {
  if (_senseiProgressRegistered) return;
  _senseiProgressRegistered = true;

  api.addEventListener("ds_sensei_progress", (e) => {
    const d = e?.detail;
    if (!d) return;

    for (const n of app.graph?._nodes || []) {
      if (n?.type === NODE_TYPE && (n._isGeneratingPrompt || n._sstate?.status === "generating" || _activeSenseiNode === n)) {
        n._livePromptStatus = d.message;
        n._livePromptStage = d.stage;
        n._livePromptProgress = d;

        if (d.stage === "completed" || d.stage === "finished") {
          n._isGeneratingPrompt = false;
          if (n._sstate) {
            n._sstate.status = "completed";
            n._sstate.telemetry = {
              tokens: d.tokens || n._sstate.telemetry?.tokens || 0,
              speed: d.speed || n._sstate.telemetry?.speed || 0,
              elapsed: d.elapsed || n._sstate.telemetry?.elapsed || 0,
              model: d.model || n._sstate.telemetry?.model || (n._sstate?.provider === "built_in" ? (n._sstate?.built_in?.model?.split(/[/\\]/).pop() || "Built In") : (n._sstate?.lm_studio?.model || "LM Studio")),
            };
          }
        }
        n._updateLlmMonitor?.();
      }
    }
  });

  api.addEventListener("executing", (e) => {
    const executingId = e?.detail;
    if (!executingId) {
      for (const n of app.graph?._nodes || []) {
        if (n?.type === NODE_TYPE) {
          n._isGeneratingPrompt = false;
          n._updateLlmMonitor?.();
        }
      }
      return;
    }
    for (const n of app.graph?._nodes || []) {
      if (n?.type === NODE_TYPE && String(n.id) === String(executingId)) {
        n._isGeneratingPrompt = true;
        _activeSenseiNode = n;
        n._updateLlmMonitor?.();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------
app.registerExtension({
  name: "DeathshotArsenal.AIPromptSensei",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      origCreated?.apply(this, arguments);
      loadCSS();
      registerGearMenu();
      installSenseiQueueHooks();
      registerSenseiProgressListener();
      this.widgets_start_y = 5;
      this.resizable = true;
      this.shape = LiteGraph.ROUND_SHAPE;
      this.min_size = [MIN_W, MIN_H];
      if (!this.size || this.size[0] < MIN_W || this.size[1] < MIN_H) {
        this.size = [DEFAULT_W, DEFAULT_H];
      }
      this.properties = this.properties || {};
      this.serialize_widgets = true;
      this._sstate = defaultState();

      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i]) {
            this.outputs[i].label = " ";
            this.outputs[i].pos = [this.size[0], 40 + i * 30];
          }
        }
      }

      this.widgets = this.widgets || [];
      let hw = this.widgets.find((w) => w.name === "SenseiState");
      if (!hw) { hw = { name: "SenseiState", type: "hidden", value: "{}", serialize: true, computeSize: () => [0, -4], draw: () => { } }; this.widgets.push(hw); }
      hw.type = "hidden"; hw.hidden = true; hw.computeSize = () => [0, -4]; hw.draw = () => { };

      const card = buildCard(this);
      this._domCard = card;
      this._domRoot = card;

      const domWidget = this.addDOMWidget("sensei_ui", "custom", card, {
        serialize: false,
        hideOnZoom: false,
        margin: CARD_MARGIN,
        getValue: () => null,
        setValue: () => { },
        // The DOM host is content-sized. It must never expand to the node base.
        // ComfyUI's DOM-widget margin is outside the visible card. The widget
        // allocation therefore needs the card stack plus both 5px margins.
        // This is the same proven sizing rule used by DS Prompt.
        getMinHeight: () => getCardsTotalHeight(this) + (CARD_MARGIN * 2),
        getMaxHeight: () => {
          const ch = getCardsTotalHeight(this);
          const y = Number.isFinite(this._senseiWidget?.y)
            ? Number(this._senseiWidget.y)
            : 5;
          const nodeHeight = Number(this.size?.[1]) || 0;
          const minWidgetHeight = ch + (CARD_MARGIN * 2);
          return Math.max(minWidgetHeight, nodeHeight - y);
        },
      });
      domWidget.computeLayoutSize = () => {
        const ch = getCardsTotalHeight(this);
        const y = Number.isFinite(domWidget.y) ? Number(domWidget.y) : 5;
        const nodeHeight = Number(this.size?.[1]) || 0;
        const minWidgetHeight = ch + (CARD_MARGIN * 2);
        return {
          minHeight: minWidgetHeight,
          maxHeight: Math.max(minWidgetHeight, nodeHeight - y),
          minWidth: MIN_W,
        };
      };
      this._senseiWidget = domWidget;
      const syncSenseiWidgetWidth = () => {
        if (!this._senseiWidget) return;
        const nodeWidth = Number(this.size?.[0]);
        if (Number.isFinite(nodeWidth) && nodeWidth > 0) {
          this._senseiWidget.width = nodeWidth;
        }
      };
      this._syncSenseiWidgetWidth = syncSenseiWidgetWidth;
      syncSenseiWidgetWidth();

      normalizeDSWidgetHost(card, this, { shell: false });
      protectDSResizeCorners(this);

      // Release native corner hit tests (Rule E)
      const originalGetWidgetOnPos = this.getWidgetOnPos;
      this.getWidgetOnPos = function (canvasX, canvasY, includeDisabled = false) {
        const x = Number(canvasX) - Number(this.pos?.[0] ?? 0);
        const y = Number(canvasY) - Number(this.pos?.[1] ?? 0);
        const w = Number(this.size?.[0] ?? 0);
        const h = Number(this.size?.[1] ?? 0);
        const handle = Number(this.constructor?.resizeHandleSize) || 15;

        const inLeft = x <= handle;
        const inRight = x >= w - handle;
        const inTop = y <= handle;
        const inBottom = y >= h - handle;

        if ((inLeft || inRight) && (inTop || inBottom)) {
          return undefined; // let native LiteGraph resizing handle the corner
        }

        return originalGetWidgetOnPos ? originalGetWidgetOnPos.call(this, canvasX, canvasY, includeDisabled) : undefined;
      };

      this.getConnectionPos = function (is_input, slot_number, out) {
        out = out || new Float32Array(2);
        if (this.flags?.collapsed) {
          return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
        }
        if (!is_input && this.outputs?.[slot_number]) {
          const slot = this.outputs[slot_number];
          const nx = this.size[0];
          if (slot.pos && Number.isFinite(slot.pos[1])) {
            out[0] = this.pos[0] + nx;
            out[1] = this.pos[1] + slot.pos[1];
            return out;
          }
          if (this._anchorEls?.[slot_number]) {
            const ny = getElementCenterY(this, this._anchorEls[slot_number]);
            if (Number.isFinite(ny)) {
              out[0] = this.pos[0] + nx;
              out[1] = this.pos[1] + ny;
              return out;
            }
          }
        }
        return LiteGraph.LGraphNode.prototype.getConnectionPos.apply(this, arguments);
      };

      try { window.DSGlobalTheme?.applyNodeBase?.(this); } catch (_) { }
      getCatalog().then(() => {
        this._renderUI?.();
        scheduleFitNode(this);
        scheduleAlign(this);
      });
      scheduleFitNode(this);
      watchAlign(this);
      scheduleAlign(this);
    };

    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      origConfigure?.apply(this, arguments);
      this.widgets_start_y = 5;
      this.shape = LiteGraph.ROUND_SHAPE;
      this.min_size = [MIN_W, MIN_H];
      if (info?.size && Array.isArray(info.size)) {
        const savedW = Math.max(MIN_W, info.size[0]);
        this.size = [savedW, getFittedHeight(this)];
      } else if (!this.size || this.size[0] < MIN_W) {
        this.size = [DEFAULT_W, getFittedHeight(this)];
      }
      if (this._senseiWidget) {
        this._senseiWidget.computeLayoutSize = () => {
          const ch = getCardsTotalHeight(this);
          const y = Number.isFinite(this._senseiWidget.y)
            ? Number(this._senseiWidget.y)
            : 5;
          const nodeHeight = Number(this.size?.[1]) || 0;
          const minWidgetHeight = ch + (CARD_MARGIN * 2);
          return {
            minHeight: minWidgetHeight,
            maxHeight: Math.max(minWidgetHeight, nodeHeight - y),
            minWidth: MIN_W,
          };
        };
      }
      if (this.outputs) {
        for (let i = 0; i < this.outputs.length; i++) {
          if (this.outputs[i]) {
            this.outputs[i].label = " ";
            this.outputs[i].pos = [this.size[0], 40 + i * 30];
          }
        }
      }
      let raw = info?.properties?.ds_sensei_state;
      if (!raw && info?.widgets_values && Array.isArray(this.widgets)) {
        const idx = this.widgets.findIndex((w) => w.name === "SenseiState");
        if (idx !== -1 && info.widgets_values[idx]) {
          raw = info.widgets_values[idx];
        }
      }
      if (!raw) {
        raw = this.widgets?.find((w) => w.name === "SenseiState")?.value;
      }
      if (raw) {
        try {
          const loaded = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (loaded && typeof loaded === "object") {
            this._sstate = {
              ...defaultState(),
              ...loaded,
              collapsed: { ...defaultState().collapsed, ...(loaded.collapsed || {}) },
              video: { ...defaultState().video, ...(loaded.video || {}) },
              models: { ...defaultState().models, ...(loaded.models || {}) },
              lm_studio: { ...defaultState().lm_studio, ...(loaded.lm_studio || {}) },
              built_in: { ...defaultState().built_in, ...(loaded.built_in || {}) },
              telemetry: { ...defaultState().telemetry, ...(loaded.telemetry || {}) },
            };
            if (loaded.notes_height) this._sstate.notes_height = loaded.notes_height;
            if (loaded.prompt_height) this._sstate.prompt_height = loaded.prompt_height;
            if (!this._sstate.system_prompt || this._sstate.system_prompt.startsWith("You are an expert AI cinematographer")) {
              this._sstate.system_prompt = DEFAULT_SYSTEM_PROMPTS.i2v;
            }
            if (!this._sstate.mode) this._sstate.mode = "i2v";
            if (!this._sstate.provider) this._sstate.provider = "lm_studio";
            if (!this._sstate.system_prompts) {
              this._sstate.system_prompts = {
                i2v: this._sstate.system_prompt || DEFAULT_SYSTEM_PROMPTS.i2v,
                t2i: DEFAULT_SYSTEM_PROMPTS.t2i,
                t2v: DEFAULT_SYSTEM_PROMPTS.t2v,
              };
            }
            if (!this._sstate.notes_per_mode) {
              this._sstate.notes_per_mode = {
                i2v: this._sstate.scene_notes || "",
                t2i: "",
                t2v: "",
              };
            }
            if (this._sstate.custom_text === undefined) {
              this._sstate.custom_text = "";
            }
            if (Array.isArray(loaded.section_order) && loaded.section_order.length === 6) {
              this._sstate.section_order = loaded.section_order;
            }
            if (Array.isArray(loaded.loras)) {
              this._sstate.loras = loaded.loras.map((lora) => ({
                name: lora.name || "",
                strength: lora.strength !== undefined ? lora.strength : 1.0,
                enabled: lora.enabled !== false,
                selectedTriggers: Array.isArray(lora.selectedTriggers) ? lora.selectedTriggers : [],
              }));
            }
            if (!this._sstate.video.size_mode) this._sstate.video.size_mode = "res";
            if (!LTX_PRESETS[this._sstate.video?.aspect_ratio]) this._sstate.video.aspect_ratio = "16:9";
            if (!this._sstate.video_per_mode) {
              this._sstate.video_per_mode = {
                i2v: { ...(this._sstate.video || {}) },
                t2i: { ...(this._sstate.video || {}), aspect_ratio: "1:1", width: 1024, height: 1024, res_preset: "1024 × 1024 (1.05 MP - 1K)" },
                t2v: { ...(this._sstate.video || {}) },
                custom: { ...(this._sstate.video || {}) },
              };
            }
          }
        } catch (e) {
          console.error("[Sensei] Error parsing configure state:", e);
        }
      }
      try { window.DSGlobalTheme?.applyNodeBase?.(this); } catch (_) { }
      this._syncState?.();
      this._renderUI?.();
      this._syncSenseiWidgetWidth?.();
      scheduleFitNode(this);
      watchAlign(this);
      scheduleAlign(this);
    };

    const origExtraMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (_, options) {
      origExtraMenu?.apply(this, arguments);
      options.push({
        content: "⚙ LM Studio & Sensei Settings",
        callback: () => {
          openSenseiGearConfig(this, null);
        },
      });
    };

    const origResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      if (this._senseiFitting) {
        origResize?.apply(this, arguments);
        return;
      }

      if (size) {
        // Sensei is vertically content-sized. User width changes are kept,
        // while node height is always re-fit to the real card stack + 5px.
        this.size[0] = Math.max(MIN_W, Number(size[0]) || MIN_W);
        this.size[1] = Math.max(MIN_H, getFittedHeight(this));
      }

      origResize?.apply(this, arguments);
      this._syncSenseiWidgetWidth?.();
      scheduleAlign(this);
      scheduleFitNode(this);
    };

    const origArrange = nodeType.prototype.arrange;
    nodeType.prototype.arrange = function () {
      alignOutputs(this);
      return origArrange?.apply(this, arguments);
    };

    const origRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      this._dsRemoved = true;
      origRemoved?.apply(this, arguments);
      unwatchAlign(this);
      if (this._dsFitTimer) clearTimeout(this._dsFitTimer);
      if (this._senseiHwPollTimer) clearInterval(this._senseiHwPollTimer);
      this._senseiRo?.disconnect?.();
      this._domCard?.remove();
      this._domRoot?.remove();
    };

    const origExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
      origExecuted?.apply(this, arguments);
      const promptText = output?.prompt?.[0];
      if (promptText) {
        this._sstate.generated_prompt = promptText;
        const newSpeed = output.speed?.[0];
        const newElapsed = output.elapsed?.[0];
        if (newSpeed && newElapsed) {
          this._sstate.telemetry = {
            tokens: output.tokens?.[0] || this._sstate.telemetry?.tokens || 0,
            speed: newSpeed,
            elapsed: newElapsed,
            model: output.model?.[0] || this._sstate.telemetry?.model || "LM Studio"
          };
        }
        this._sstate.status = "completed";
        this._sstate.error_msg = null;
        this._syncState?.();
        this._renderUI?.();
      }
    };

    const origSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      this._syncState?.();
      const o = origSerialize?.apply(this, arguments) || {};
      o.properties = o.properties || {};
      o.properties.ds_sensei_state = JSON.parse(JSON.stringify(this._sstate));
      if (o.widgets_values && Array.isArray(this.widgets)) {
        const idx = this.widgets.findIndex((w) => w.name === "SenseiState");
        if (idx !== -1) {
          o.widgets_values[idx] = JSON.stringify(this._sstate);
        }
      }
      if (o?.outputs) {
        for (const out of o.outputs) {
          if (out) delete out.pos;
        }
      }
      return o;
    };
  },

  async setup() {
    registerGearMenu();
    installSenseiQueueHooks();
    registerSenseiProgressListener();
  },
});
