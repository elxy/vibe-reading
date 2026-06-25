import { deepmerge } from "deepmerge-ts"
import { useAtom } from "jotai"
import { i18n } from "#imports"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/base-ui/field"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { resolveFloatingTranslateButtonEnabled } from "@/utils/content/device"
import { ConfigCard } from "../../components/config-card"

export function FloatingTranslateButton() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const checked = resolveFloatingTranslateButtonEnabled(translateConfig.page.floatingButtonEnabled)

  return (
    <ConfigCard
      id="floating-translate-button"
      title={i18n.t("options.translation.floatingTranslateButton.title")}
      description={i18n.t("options.translation.floatingTranslateButton.description")}
    >
      <Field orientation="horizontal">
        <FieldContent className="self-center">
          <FieldLabel htmlFor="floating-translate-button-toggle">
            {i18n.t("options.translation.floatingTranslateButton.enable")}
          </FieldLabel>
          <FieldDescription>
            {i18n.t("options.translation.floatingTranslateButton.enableDescription")}
          </FieldDescription>
        </FieldContent>
        <Switch
          id="floating-translate-button-toggle"
          checked={checked}
          onCheckedChange={(floatingButtonEnabled) => {
            void setTranslateConfig(
              deepmerge(translateConfig, {
                page: {
                  floatingButtonEnabled,
                },
              }),
            )
          }}
        />
      </Field>
    </ConfigCard>
  )
}
