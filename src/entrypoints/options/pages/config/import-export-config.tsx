import type { ConfigExport } from "@/types/config/export"

import { IconDownload, IconUpload } from "@tabler/icons-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { i18n } from "#imports"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/base-ui/alert-dialog"
import { Button } from "@/components/ui/base-ui/button"
import {
  applyConfigImport,
  exportConfigToFile,
  parseConfigExport,
} from "@/utils/config/import-export"
import { logger } from "@/utils/logger"
import { ConfigCard } from "../../components/config-card"

export function ImportExportConfig() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingPayloadRef = useRef<ConfigExport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    try {
      await exportConfigToFile()
      toast.success(i18n.t("options.config.importExport.exportSuccess"))
    }
    catch (error) {
      logger.error("Failed to export config", error)
      toast.error(i18n.t("options.config.importExport.exportFailed"))
    }
  }

  async function handleFileSelect(file: File) {
    try {
      const text = await file.text()
      pendingPayloadRef.current = parseConfigExport(text)
      setConfirmOpen(true)
    }
    catch (error) {
      logger.error("Failed to parse import file", error)
      toast.error(i18n.t("options.config.importExport.importInvalidFile"))
    }
  }

  async function handleConfirmImport() {
    const payload = pendingPayloadRef.current
    if (!payload)
      return
    try {
      await applyConfigImport(payload)
      toast.success(i18n.t("options.config.importExport.importSuccess"))
    }
    catch (error) {
      logger.error("Failed to apply imported config", error)
      toast.error(i18n.t("options.config.importExport.importFailed"))
    }
    finally {
      pendingPayloadRef.current = null
      setConfirmOpen(false)
    }
  }

  return (
    <ConfigCard
      id="import-export-config"
      title={i18n.t("options.config.importExport.title")}
      description={(
        <>
          <div>{i18n.t("options.config.importExport.description")}</div>
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-500">
            ⚠️
            {" "}
            {i18n.t("options.config.importExport.apiKeyWarning")}
          </div>
        </>
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file)
            void handleFileSelect(file)
          // Reset so selecting the same file twice still fires onChange.
          e.target.value = ""
        }}
      />
      <div className="flex w-full flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <IconUpload className="size-4" />
          {i18n.t("options.config.importExport.importButton")}
        </Button>
        <Button
          variant="outline"
          onClick={() => void handleExport()}
        >
          <IconDownload className="size-4" />
          {i18n.t("options.config.importExport.exportButton")}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18n.t("options.config.importExport.dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {i18n.t("options.config.importExport.dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {i18n.t("options.config.importExport.dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleConfirmImport()}
            >
              {i18n.t("options.config.importExport.dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfigCard>
  )
}
