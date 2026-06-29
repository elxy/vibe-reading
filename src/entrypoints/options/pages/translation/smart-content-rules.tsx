import { deepmerge } from "deepmerge-ts"
import { useAtom } from "jotai"
import { useMemo } from "react"
import { i18n } from "#imports"
import { Field, FieldContent, FieldLabel } from "@/components/ui/base-ui/field"
import { Switch } from "@/components/ui/base-ui/switch"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { parseSmartRules } from "@/utils/host/translate/smart/user-rules"
import { ConfigCard } from "../../components/config-card"

export function SmartContentRules() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const customRules = translateConfig.page.smart.customRules
  const debug = translateConfig.page.smart.debug

  const parseResult = useMemo(() => parseSmartRules(customRules), [customRules])

  return (
    <ConfigCard
      id="smart-content-rules"
      title={i18n.t("options.translation.smartContentRules.title")}
      description={i18n.t("options.translation.smartContentRules.description")}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="smart-content-rules-textarea" className="text-sm font-medium">
            {i18n.t("options.translation.smartContentRules.customRules")}
          </label>
          <Textarea
            id="smart-content-rules-textarea"
            className="mt-2"
            value={customRules}
            onChange={(e) => {
              void setTranslateConfig(
                deepmerge(translateConfig, {
                  page: {
                    smart: {
                      customRules: e.target.value,
                    },
                  },
                }),
              )
            }}
            rows={8}
            placeholder={
              "!example.com .sidebar\nexample.com article\n=example.com main\n*.example.com .content\n* .global"
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {i18n.t("options.translation.smartContentRules.help")}
          </p>
          {parseResult.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {parseResult.errors.map((error, index) => (
                <li key={index} className="text-xs text-destructive">
                  {i18n.t("options.translation.smartContentRules.line")}
                  {" "}
                  {error.line}
                  {": "}
                  {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field orientation="horizontal">
          <FieldContent className="self-center">
            <FieldLabel htmlFor="smart-content-rules-debug">
              {i18n.t("options.translation.smartContentRules.debug")}
            </FieldLabel>
          </FieldContent>
          <Switch
            id="smart-content-rules-debug"
            checked={debug}
            onCheckedChange={(checked) => {
              void setTranslateConfig(
                deepmerge(translateConfig, {
                  page: {
                    smart: {
                      debug: checked,
                    },
                  },
                }),
              )
            }}
          />
        </Field>
      </div>
    </ConfigCard>
  )
}
