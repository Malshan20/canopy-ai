"use client";

import { useEffect, useState } from "react";
import { FileCode, Loader2, ShieldCheck, ShieldAlert, Info } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { useOperatorProfile } from "@/hooks/use-operator-profile";
import { useXmlDownload } from "@/hooks/use-xml-download";
import {
  approveShipmentExport,
  fetchOrganizationProfile,
  fetchShipmentExportApproval,
  type ShipmentApproval,
} from "@/services/api";

interface DownloadXmlDialogProps {
  shipmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Collects the operator, activity, and commodity details required to
 * generate a DDS document (CanoryAI has no operator/company profile
 * system yet, so these are supplied per-export) and triggers the
 * download. Values are remembered in this browser via
 * `useOperatorProfile` so returning to export another shipment doesn't
 * require re-typing the same company details.
 *
 * The field set matches the real EUDR DDS schema — verified against a
 * production-tested open-source EUDR API client, not assumed — see
 * backend/app/services/xml_generator.py's module docstring for the full,
 * honest account of what "matches the real schema" does and doesn't mean
 * (it is not proof of SOAP-level submission compatibility, and CanoryAI
 * has never submitted to TRACES NT with real credentials). The banner
 * below says exactly that, in-product, not just in code comments.
 *
 * Gated by an explicit compliance sign-off when the organization has
 * `require_export_approval` on (the default — see
 * backend/app/models/organization.py). The approval step shows first;
 * the operator-details form only appears once the shipment is approved
 * (or immediately, for organizations that have turned this off in
 * Settings). Approval permission (owner/admin/compliance_manager) is
 * enforced server-side, not duplicated here — anyone can click Approve,
 * and a 403 surfaces as a clear toast if they don't have the role for it.
 */
export function DownloadXmlDialog({ shipmentId, open, onOpenChange }: DownloadXmlDialogProps) {
  const { profile, setProfile } = useOperatorProfile();
  const { isDownloading, download } = useXmlDownload();
  const [formError, setFormError] = useState<string | null>(null);

  const [requiresApproval, setRequiresApproval] = useState<boolean | null>(null);
  const [approval, setApproval] = useState<ShipmentApproval | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (!open) return;

    Promise.all([fetchOrganizationProfile(), fetchShipmentExportApproval(shipmentId)]).then(
      ([orgResult, approvalResult]) => {
        setRequiresApproval(orgResult.ok ? orgResult.data.require_export_approval : true);
        setApproval(approvalResult.ok ? approvalResult.data : null);
      },
    );
  }, [open, shipmentId]);

  async function handleApprove() {
    setIsApproving(true);
    const result = await approveShipmentExport(shipmentId);
    setIsApproving(false);

    if (!result.ok) {
      toast.error("Could not approve this shipment", { description: result.error.message });
      return;
    }
    setApproval(result.data);
    toast.success("Shipment approved for export");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const required: Array<[string, string]> = [
      ["Operator name", profile.operatorName],
      ["Operator country", profile.operatorCountry],
      ["Operator address", profile.operatorAddress],
      ["Operator email", profile.operatorEmail],
      ["Operator phone", profile.operatorPhone],
      ["Country of activity", profile.countryOfActivity],
      ["Border-cross country", profile.borderCrossCountry],
      ["HS code", profile.hsCode],
    ];
    const missing = required.filter(([, value]) => !value.trim()).map(([label]) => label);
    if (missing.length > 0) {
      setFormError(`Required: ${missing.join(", ")}.`);
      return;
    }
    setFormError(null);

    const succeeded = await download(shipmentId, {
      operatorType: profile.operatorType,
      activityType: profile.activityType,
      countryOfActivity: profile.countryOfActivity.trim().toUpperCase(),
      borderCrossCountry: profile.borderCrossCountry.trim().toUpperCase(),
      operatorName: profile.operatorName.trim(),
      operatorCountry: profile.operatorCountry.trim().toUpperCase(),
      operatorAddress: profile.operatorAddress.trim(),
      operatorEmail: profile.operatorEmail.trim(),
      operatorPhone: profile.operatorPhone.trim(),
      operatorEori: profile.operatorEori.trim() || undefined,
      hsCode: profile.hsCode.trim(),
      commodityDescription: profile.commodityDescription.trim() || undefined,
      countryOfProduction: profile.countryOfProduction.trim() || undefined,
      geolocationConfidential: profile.geolocationConfidential,
    });

    if (succeeded) {
      onOpenChange(false);
    }
  }

  const isLoadingGate = requiresApproval === null;
  const needsApprovalStep = requiresApproval === true && !approval?.approved;

  if (isLoadingGate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (needsApprovalStep) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-warning" aria-hidden="true" />
              Compliance sign-off required
            </DialogTitle>
            <DialogDescription>
              Your organization requires an explicit approval before a shipment&apos;s DDS document
              can be generated. This is a deliberate extra check, not a sign that anything is wrong —
              your organization can turn this off in Settings once you&apos;ve built confidence in
              the automated checks.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isApproving}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isApproving}>
              {isApproving ? (
                <>
                  <Loader2 className="animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <ShieldCheck />
                  Approve for export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="size-5 text-primary" aria-hidden="true" />
              Generate DDS document
            </DialogTitle>
            <DialogDescription>
              These details populate the Due Diligence Statement. They&apos;re remembered in this
              browser for future exports.
            </DialogDescription>
          </DialogHeader>

          <Alert className="mt-2">
            <Info className="size-4" aria-hidden="true" />
            <AlertTitle>Not a TRACES NT submission</AlertTitle>
            <AlertDescription>
              This document is structured to match the real EUDR DDS schema, for your review before
              filing. CanoryAI does not submit to TRACES NT directly — you&apos;ll need to file this
              yourself through the official TRACES NT portal.
            </AlertDescription>
          </Alert>

          <div className="space-y-5 py-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="operator-type">Operator type</Label>
                  <Select
                    value={profile.operatorType}
                    onValueChange={(v) => setProfile({ ...profile, operatorType: v as "OPERATOR" | "TRADER" })}
                  >
                    <SelectTrigger id="operator-type" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPERATOR">Operator</SelectItem>
                      <SelectItem value="TRADER">Trader</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="activity-type">Activity type</Label>
                  <Select
                    value={profile.activityType}
                    onValueChange={(v) =>
                      setProfile({ ...profile, activityType: v as "TRADE" | "IMPORT" | "EXPORT" | "DOMESTIC" })
                    }
                  >
                    <SelectTrigger id="activity-type" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMPORT">Import</SelectItem>
                      <SelectItem value="EXPORT">Export</SelectItem>
                      <SelectItem value="TRADE">Trade</SelectItem>
                      <SelectItem value="DOMESTIC">Domestic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="country-of-activity">Country of activity</Label>
                  <Input
                    id="country-of-activity"
                    placeholder="DE"
                    maxLength={2}
                    value={profile.countryOfActivity}
                    onChange={(e) => setProfile({ ...profile, countryOfActivity: e.target.value.toUpperCase() })}
                    className="mt-1.5 uppercase"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="border-cross-country">Border-cross country</Label>
                  <Input
                    id="border-cross-country"
                    placeholder="DE"
                    maxLength={2}
                    value={profile.borderCrossCountry}
                    onChange={(e) => setProfile({ ...profile, borderCrossCountry: e.target.value.toUpperCase() })}
                    className="mt-1.5 uppercase"
                    required
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operator</p>
              <div>
                <Label htmlFor="operator-name">Legal name</Label>
                <Input
                  id="operator-name"
                  placeholder="Example Import GmbH"
                  value={profile.operatorName}
                  onChange={(e) => setProfile({ ...profile, operatorName: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="operator-country">Country</Label>
                  <Input
                    id="operator-country"
                    placeholder="DE"
                    maxLength={2}
                    value={profile.operatorCountry}
                    onChange={(e) => setProfile({ ...profile, operatorCountry: e.target.value.toUpperCase() })}
                    className="mt-1.5 uppercase"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="operator-eori">
                    EORI <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="operator-eori"
                    placeholder="DE123456789012345"
                    value={profile.operatorEori}
                    onChange={(e) => setProfile({ ...profile, operatorEori: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="operator-address">Address</Label>
                <Input
                  id="operator-address"
                  placeholder="Musterstrasse 1, 10115 Berlin"
                  value={profile.operatorAddress}
                  onChange={(e) => setProfile({ ...profile, operatorAddress: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="operator-email">Email</Label>
                  <Input
                    id="operator-email"
                    type="email"
                    placeholder="ops@example.com"
                    value={profile.operatorEmail}
                    onChange={(e) => setProfile({ ...profile, operatorEmail: e.target.value })}
                    className="mt-1.5"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="operator-phone">Phone</Label>
                  <Input
                    id="operator-phone"
                    placeholder="+49 30 1234567"
                    value={profile.operatorPhone}
                    onChange={(e) => setProfile({ ...profile, operatorPhone: e.target.value })}
                    className="mt-1.5"
                    required
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commodity</p>
              <div>
                <Label htmlFor="hs-code">HS code</Label>
                <Input
                  id="hs-code"
                  placeholder="1801"
                  value={profile.hsCode}
                  onChange={(e) => setProfile({ ...profile, hsCode: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="commodity-description">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="commodity-description"
                  placeholder="Auto-detected from shipment if left blank"
                  value={profile.commodityDescription}
                  onChange={(e) => setProfile({ ...profile, commodityDescription: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="country-of-production">
                  Default country of production{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="country-of-production"
                  placeholder="Used for plots whose document has no country of its own"
                  value={profile.countryOfProduction}
                  onChange={(e) => setProfile({ ...profile, countryOfProduction: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Geolocation confidential</p>
                  <p className="text-xs text-muted-foreground">Request the EU withhold plot coordinates publicly.</p>
                </div>
                <Switch
                  checked={profile.geolocationConfidential}
                  onCheckedChange={(checked) => setProfile({ ...profile, geolocationConfidential: checked })}
                  aria-label="Geolocation confidential"
                />
              </div>
            </div>

            {formError && <p className="text-sm text-danger">{formError}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isDownloading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isDownloading}>
              {isDownloading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileCode />
                  Generate &amp; Download
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
