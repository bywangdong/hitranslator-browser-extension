import type { Config } from "@/types/config/config"
import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import type {
  CustomActionProviderRef,
  SelectionToolbarTranslateProviderRef,
} from "@/utils/providers/provider-registry"
import { dequal } from "dequal"
import { selectAtom } from "jotai/utils"
import { configAtom } from "@/utils/atoms/config"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"

export interface SelectionToolbarTranslateRequestSlice {
  language: Config["language"]
  enableAIContentAware: boolean
  customPromptsConfig: Config["translate"]["customPromptsConfig"]
  provider: SelectionToolbarTranslateProviderRef | null
}

export interface SelectionToolbarCustomActionRequestSlice {
  language: Config["language"]
  action: SelectionToolbarCustomAction | null
  provider: CustomActionProviderRef | null
}

export const selectionToolbarTranslateRequestAtom = selectAtom(
  configAtom,
  (config): SelectionToolbarTranslateRequestSlice => ({
    language: config.language,
    enableAIContentAware: config.translate.enableAIContentAware,
    customPromptsConfig: config.translate.customPromptsConfig,
    provider: resolveProviderRefForCapability(
      "selectionToolbar.translate",
      config.providersConfig,
      config.selectionToolbar.features.translate.providerId,
    ),
  }),
  dequal,
)
