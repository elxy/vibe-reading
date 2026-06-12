import type { APIProviderTypes } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"

export function ConfigHeader({ providerType }: { providerType: APIProviderTypes }) {
  const { theme } = useTheme()
  const providerItem = PROVIDER_ITEMS[providerType]
  const providerIcon = (
    <ProviderIcon
      logo={providerItem.logo(theme)}
      name={providerItem.name}
      size="base"
      className={providerItem.website ? "group hover:cursor-pointer" : undefined}
      textClassName={providerItem.website ? "font-medium group-hover:text-link" : "font-medium"}
    />
  )

  return (
    <div className="flex items-start justify-between">
      {providerItem.website
        ? <a href={providerItem.website} className="flex items-center gap-2" target="_blank" rel="noreferrer">{providerIcon}</a>
        : providerIcon}
    </div>
  )
}
