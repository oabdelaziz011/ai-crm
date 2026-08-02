/** Presentation-only feature gates for omnichannel composer actions. */
export const OMNICHANNEL_COMPOSER_FEATURES = {
  emoji: true,
  attachments: true,
  voice: false,
  templates: true,
  savedReplies: true,
  aiRewrite: false,
  translate: true,
  mention: true,
  suggestedReplies: true,
  internalNote: true,
} as const;

export type OmnichannelComposerFeature = keyof typeof OMNICHANNEL_COMPOSER_FEATURES;

export type ComposerFeatureMode = boolean;

export const OMNICHANNEL_COMPOSER_DISABLED_REASON_KEYS: Partial<
  Record<OmnichannelComposerFeature, string>
> = {
  attachments: "omnichannel.composer.disabled.attachments",
  voice: "omnichannel.composer.disabled.voice",
  templates: "omnichannel.composer.disabled.templates",
  aiRewrite: "omnichannel.composer.disabled.aiRewrite",
  translate: "omnichannel.composer.disabled.translate",
  mention: "omnichannel.composer.disabled.mention",
};

export function getComposerFeatureMode(feature: OmnichannelComposerFeature): ComposerFeatureMode {
  return OMNICHANNEL_COMPOSER_FEATURES[feature];
}

export function isComposerFeatureVisible(feature: OmnichannelComposerFeature): boolean {
  return true;
}

export function isComposerFeatureInteractive(feature: OmnichannelComposerFeature): boolean {
  return getComposerFeatureMode(feature) === true;
}

export function getComposerFeatureDisabledReasonKey(
  feature: OmnichannelComposerFeature,
): string | null {
  if (isComposerFeatureInteractive(feature)) return null;
  return OMNICHANNEL_COMPOSER_DISABLED_REASON_KEYS[feature] ?? "omnichannel.composer.disabled.generic";
}

/** Sprint 11 — composer draft translation uses phrase-map runtime. */
export const OMNICHANNEL_TOOLBAR_TRANSLATE_ENABLED = true;
export const OMNICHANNEL_TOOLBAR_TRANSLATE_DISABLED_REASON_KEY =
  "omnichannel.composer.disabled.translate";
