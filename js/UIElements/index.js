/**
 * DeathshotArsenal Unified UI Component Library
 * Master export & runtime bridge for all components and styling.
 */

import { DSIcon, DSIconMarkup, hasIcon } from "../Icons/index.js";
import { DS_TOKENS, DS_CSS_VARS } from "./Theme/tokens.js";
import { computeSmartContrast, getRelativeLuminance } from "./Theme/contrast.js";

// Core
import { Card } from "./Core/Card.js";
import { Field } from "./Core/Field.js";
import { Section } from "./Core/Section.js";
import { Popup } from "./Core/Popup.js";
import { normalizeDSWidgetHost, protectDSResizeCorners } from "./Core/system.js";

// Controls
import { Button } from "./Controls/Button.js";
import { Dropdown } from "./Controls/Dropdown.js";
import { Slider } from "./Controls/Slider.js";
import { Stepper } from "./Controls/Stepper.js";
import { ArrowSelector } from "./Controls/ArrowSelector.js";
import { Toggle } from "./Controls/Toggle.js";
import { ColorPicker, DEFAULT_COLOR_PRESETS } from "./Controls/ColorPicker.js";

import {
  openCivitaiRetrieverModal,
  retrieveCivitaiMetadata,
  getCivitaiSettings,
  saveCivitaiSettings,
} from "./Controls/CivitaiRetriever.js";

// Text
import { TextPreview } from "./Text/TextPreview.js";
import { TextEditor } from "./Text/TextEditor.js";

// Preview
import { ImagePreview } from "./Preview/ImagePreview.js";
import { VideoPreview } from "./Preview/VideoPreview.js";
import { VideoPlayerModal } from "./Preview/VideoPlayerModal.js";

// Status
import { StatusBar } from "./Status/StatusBar.js";

export {
  DSIcon,
  DSIconMarkup,
  hasIcon,
  DS_TOKENS,
  DS_CSS_VARS,
  computeSmartContrast,
  getRelativeLuminance,
  Card,
  Field,
  Section,
  Popup,
  normalizeDSWidgetHost,
  protectDSResizeCorners,
  Button,
  Dropdown,
  Slider,
  Stepper,
  ArrowSelector,
  Toggle,
  ColorPicker,
  DEFAULT_COLOR_PRESETS,
  openCivitaiRetrieverModal,
  retrieveCivitaiMetadata,
  getCivitaiSettings,
  saveCivitaiSettings,
  TextPreview,
  TextEditor,
  ImagePreview,
  VideoPreview,
  VideoPlayerModal,
  StatusBar,
};

let stylesInstalled = false;

export function installDSUI() {
  if (stylesInstalled || typeof document === "undefined") return;
  stylesInstalled = true;

  // 1. Inject Icons stylesheet
  const iconStyleId = "ds-ui-icons-style";
  if (!document.getElementById(iconStyleId)) {
    const link = document.createElement("link");
    link.id = iconStyleId;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Icons/ds_icons.css";
    document.head.appendChild(link);
  }

  // 2. Inject Components stylesheet
  const uiStyleId = "ds-ui-components-style";
  if (!document.getElementById(uiStyleId)) {
    const link = document.createElement("link");
    link.id = uiStyleId;
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/UIElements/Theme/ds_ui.css";
    document.head.appendChild(link);
  }
}

// Automatically install stylesheets on import
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installDSUI, { once: true });
  } else {
    installDSUI();
  }
}

// Bind to window.DSUI
if (typeof window !== "undefined") {
  window.DSUI = window.DSUI || {};
  window.DSUI.tokens = DS_TOKENS;
  window.DSUI.cssVars = DS_CSS_VARS;
  window.DSUI.Icon = DSIcon;
  window.DSUI.Card = Card;
  window.DSUI.Field = Field;
  window.DSUI.Section = Section;
  window.DSUI.Popup = Popup;
  window.DSUI.Button = Button;
  window.DSUI.Dropdown = Dropdown;
  window.DSUI.Slider = Slider;
  window.DSUI.Stepper = Stepper;
  window.DSUI.ArrowSelector = ArrowSelector;
  window.DSUI.Toggle = Toggle;
  window.DSUI.ColorPicker = ColorPicker;
  window.DSUI.TextPreview = TextPreview;
  window.DSUI.TextEditor = TextEditor;
  window.DSUI.ImagePreview = ImagePreview;
  window.DSUI.VideoPreview = VideoPreview;
  window.DSUI.VideoPlayerModal = VideoPlayerModal;
  window.DSUI.StatusBar = StatusBar;
  window.DSUI.normalizeWidgetHost = normalizeDSWidgetHost;
  window.DSUI.protectResizeCorners = protectDSResizeCorners;
  window.DSUI.install = installDSUI;
}
