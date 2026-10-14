import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { MdSettings, MdApartment, MdSave, MdRefresh, MdShield, MdCheckCircle, MdErrorOutline } from "react-icons/md";
import { API_BASE_URL } from "../api.js";

const CURRENCIES = [
  ["INR", "Indian Rupee (INR)"], ["USD", "US Dollar (USD)"], ["GBP", "British Pound (GBP)"],
  ["AED", "UAE Dirham (AED)"], ["EUR", "Euro (EUR)"], ["AUD", "Australian Dollar (AUD)"],
  ["CAD", "Canadian Dollar (CAD)"], ["SGD", "Singapore Dollar (SGD)"],
];
const LOCALES = [["en-IN", "English (India)"], ["hi-IN", "Hindi (India)"], ["gu-IN", "Gujarati (India)"], ["en-GB", "English (UK)"], ["en-US", "English (US)"]];
const DATE_FORMATS = [["DD-MM-YYYY", "DD-MM-YYYY (14-10-2026)"], ["MM-DD-YYYY", "MM-DD-YYYY (10-14-2026)"], ["YYYY-MM-DD", "YYYY-MM-DD (2026-10-14)"]];
const MONTHS = [["1", "January"], ["2", "February"], ["3", "March"], ["4", "April"], ["5", "May"], ["6", "June"], ["7", "July"], ["8", "August"], ["9", "September"], ["10", "October"], ["11", "November"], ["12", "December"]];

const EMPTY_ADDRESS = { line1: "", line2: "", city: "", state: "", postalCode: "", country: "India" };
const EMPTY_ORG = {
  name: "", timezone: "Asia/Kolkata", locale: "en-IN", currency: "INR",
  contact: { email: "", phone: "", website: "", address: { ...EMPTY_ADDRESS } },
  settings: { academicYearStartMonth: 4, dateFormat: "DD-MM-YYYY", defaultLanguage: "en" },
};
const EMPTY_BRANCH = { name: "", code: "", timezone: "Asia/Kolkata", phone: "", email: "", website: "", address: { ...EMPTY_ADDRESS } };

const api = async (path, { method = "GET", organizationId, branchId, data } = {}) => {
  const token = localStorage.getItem("token");
  const response = await axios({
    url: API_BASE_URL + path,
    method,
    data,
    headers: {
      ...(token ? { "x-auth-token": token } : {}),
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
      ...(branchId ? { "x-branch-id": branchId } : {}),
    },
  });
  return response.data;
};
const errorText = (error) => error?.response?.data?.message || "Settings could not be saved. Please try again.";

function TextField({ label, value, onChange, type = "text", required = false, maxLength, placeholder, disabled = false, autoComplete }) {
  return (
    <label className="saas-setting-field">
      <span>{label}{required ? " *" : ""}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
      />
    </label>
  );
}
function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="saas-setting-field">
      <span>{label}</span>
      <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map(([option, text]) => <option value={option} key={option}>{text}</option>)}
      </select>
    </label>
  );
}
function AddressFields({ address, setAddress, disabled = false }) {
  const update = (key, value) => setAddress((current) => ({ ...current, [key]: value }));
  return (
    <div className="saas-setting-address-grid">
      <TextField label="Address line 1" value={address.line1} onChange={(value) => update("line1", value)} maxLength={160} disabled={disabled} />
      <TextField label="Address line 2" value={address.line2} onChange={(value) => update("line2", value)} maxLength={160} disabled={disabled} />
      <TextField label="City" value={address.city} onChange={(value) => update("city", value)} maxLength={100} disabled={disabled} />
      <TextField label="State / region" value={address.state} onChange={(value) => update("state", value)} maxLength={100} disabled={disabled} />
      <TextField label="Postal code" value={address.postalCode} onChange={(value) => update("postalCode", value)} maxLength={20} disabled={disabled} />
      <TextField label="Country" value={address.country} onChange={(value) => update("country", value)} maxLength={100} disabled={disabled} />
    </div>
  );
}

export default function OrganizationSettingsPanel({ organizationId, branchId, canManageOrganization }) {
  const [organization, setOrganization] = useState(EMPTY_ORG);
  const [branch, setBranch] = useState(EMPTY_BRANCH);
  const [loadingOrganization, setLoadingOrganization] = useState(true);
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadOrganization = useCallback(async () => {
    if (!organizationId) return;
    setLoadingOrganization(true);
    try {
      const data = await api("/api/saas/settings/organization", { organizationId });
      setOrganization({
        ...EMPTY_ORG,
        ...data,
        contact: {
          ...EMPTY_ORG.contact,
          ...(data.contact || {}),
          address: { ...EMPTY_ADDRESS, ...(data.contact?.address || {}) },
        },
        settings: { ...EMPTY_ORG.settings, ...(data.settings || {}) },
      });
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setLoadingOrganization(false);
    }
  }, [organizationId]);

  const loadBranch = useCallback(async () => {
    if (!organizationId || !branchId) {
      setBranch(EMPTY_BRANCH);
      return;
    }
    setLoadingBranch(true);
    try {
      const data = await api("/api/saas/settings/branches/" + encodeURIComponent(branchId), { organizationId, branchId });
      setBranch({
        ...EMPTY_BRANCH,
        ...data,
        address: { ...EMPTY_ADDRESS, ...(data.address || {}) },
      });
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setLoadingBranch(false);
    }
  }, [organizationId, branchId]);

  useEffect(() => { loadOrganization(); }, [loadOrganization]);
  useEffect(() => { loadBranch(); }, [loadBranch]);

  const updateOrganization = (key, value) => setOrganization((current) => ({ ...current, [key]: value }));
  const updateContact = (key, value) => setOrganization((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
  const updateOrgAddress = (updater) => setOrganization((current) => ({
    ...current,
    contact: { ...current.contact, address: typeof updater === "function" ? updater(current.contact.address) : updater },
  }));
  const updatePreference = (key, value) => setOrganization((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const updateBranch = (key, value) => setBranch((current) => ({ ...current, [key]: value }));
  const updateBranchAddress = (updater) => setBranch((current) => ({
    ...current,
    address: typeof updater === "function" ? updater(current.address) : updater,
  }));

  const saveOrganization = async (event) => {
    event.preventDefault();
    if (!canManageOrganization) return;
    setSavingOrganization(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const data = await api("/api/saas/settings/organization", {
        method: "PUT",
        organizationId,
        data: {
          name: organization.name,
          timezone: organization.timezone,
          locale: organization.locale,
          currency: organization.currency,
          contact: organization.contact,
          settings: {
            ...organization.settings,
            academicYearStartMonth: Number(organization.settings.academicYearStartMonth),
          },
        },
      });
      setOrganization({
        ...EMPTY_ORG, ...data.organization,
        contact: { ...EMPTY_ORG.contact, ...(data.organization.contact || {}), address: { ...EMPTY_ADDRESS, ...(data.organization.contact?.address || {}) } },
        settings: { ...EMPTY_ORG.settings, ...(data.organization.settings || {}) },
      });
      setSuccessMessage(data.message || "Organization settings saved.");
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setSavingOrganization(false);
    }
  };

  const saveBranch = async (event) => {
    event.preventDefault();
    if (!canManageOrganization || !branchId) return;
    setSavingBranch(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const data = await api("/api/saas/settings/branches/" + encodeURIComponent(branchId), {
        method: "PUT",
        organizationId,
        branchId,
        data: {
          name: branch.name,
          timezone: branch.timezone,
          phone: branch.phone,
          email: branch.email,
          website: branch.website,
          address: branch.address,
        },
      });
      setBranch({ ...EMPTY_BRANCH, ...data.branch, address: { ...EMPTY_ADDRESS, ...(data.branch.address || {}) } });
      setSuccessMessage(data.message || "Branch settings saved.");
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setSavingBranch(false);
    }
  };

  const editDisabled = !canManageOrganization;
  const currencyOptions = CURRENCIES.some(([value]) => value === organization.currency)
    ? CURRENCIES
    : [[organization.currency, organization.currency + " (current)"], ...CURRENCIES];

  return (
    <section className="saas-section">
      <div className="saas-section-heading">
        <div>
          <h2>Organization settings</h2>
          <p>Keep your school’s contact details, local time and date preferences up to date.</p>
        </div>
        <button type="button" className="saas-secondary-button" onClick={() => { loadOrganization(); loadBranch(); }} disabled={loadingOrganization || loadingBranch}><MdRefresh /> Refresh</button>
      </div>

      {(errorMessage || successMessage) && (
        <div className={"saas-message " + (errorMessage ? "error" : "success")} role={errorMessage ? "alert" : "status"}>
          {errorMessage ? <MdErrorOutline /> : <MdCheckCircle />}
          <span>{errorMessage || successMessage}</span>
          <button type="button" onClick={() => { setErrorMessage(""); setSuccessMessage(""); }} aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="saas-settings-note"><MdShield /><span>Changes are saved with an audit entry. The organization ID, branch code and existing financial history cannot be edited here.</span></div>

      <form className="saas-form-card" onSubmit={saveOrganization}>
        <div className="saas-form-heading">
          <div><h3><MdSettings /> Organization profile</h3><p>These details represent the preschool organization, not an individual branch.</p></div>
          {organization.slug && <span className="saas-settings-slug">{organization.slug}</span>}
        </div>
        {loadingOrganization ? <div className="saas-loading">Loading organization settings…</div> : (
          <>
            <div className="saas-form-grid">
              <TextField label="Organization name" value={organization.name} onChange={(value) => updateOrganization("name", value)} required maxLength={120} disabled={editDisabled} />
              <TextField label="Contact email" value={organization.contact.email} onChange={(value) => updateContact("email", value)} type="email" maxLength={254} disabled={editDisabled} />
              <TextField label="Contact phone" value={organization.contact.phone} onChange={(value) => updateContact("phone", value)} type="tel" maxLength={30} disabled={editDisabled} />
              <TextField label="Website (HTTPS)" value={organization.contact.website} onChange={(value) => updateContact("website", value)} type="url" maxLength={300} placeholder="https://school.example" disabled={editDisabled} />
              <SelectField label="Time zone" value={organization.timezone} onChange={(value) => updateOrganization("timezone", value)} disabled={editDisabled} options={[
                ["Asia/Kolkata", "India (Asia/Kolkata)"], ["Asia/Dubai", "UAE (Asia/Dubai)"], ["Asia/Singapore", "Singapore"], ["Europe/London", "United Kingdom"], ["America/New_York", "US Eastern"], ["Australia/Sydney", "Australia (Sydney)"],
              ]} />
              <SelectField label="Display locale" value={organization.locale} onChange={(value) => updateOrganization("locale", value)} disabled={editDisabled} options={LOCALES} />
              <SelectField label="Currency" value={organization.currency} onChange={(value) => updateOrganization("currency", value)} disabled={editDisabled} options={currencyOptions} />
              <SelectField label="Default language" value={organization.settings.defaultLanguage} onChange={(value) => updatePreference("defaultLanguage", value)} disabled={editDisabled} options={[["en", "English"], ["hi", "Hindi"], ["gu", "Gujarati"]]} />
              <SelectField label="Date format" value={organization.settings.dateFormat} onChange={(value) => updatePreference("dateFormat", value)} disabled={editDisabled} options={DATE_FORMATS} />
              <SelectField label="Academic year starts in" value={organization.settings.academicYearStartMonth} onChange={(value) => updatePreference("academicYearStartMonth", value)} disabled={editDisabled} options={MONTHS} />
            </div>
            <div className="saas-setting-subhead"><h4>Organization address</h4><p>Used for identifying the organization in internal documents and future printable forms.</p></div>
            <AddressFields address={organization.contact.address} setAddress={updateOrgAddress} disabled={editDisabled} />
            <div className="saas-form-actions">
              <button type="submit" className="saas-primary-button" disabled={editDisabled || savingOrganization || loadingOrganization}><MdSave /> {savingOrganization ? "Saving…" : "Save organization settings"}</button>
            </div>
          </>
        )}
      </form>

      <form className="saas-form-card" onSubmit={saveBranch}>
        <div className="saas-form-heading">
          <div><h3><MdApartment /> Branch profile</h3><p>These details apply only to the branch selected at the top of the workspace.</p></div>
          {branch.code && <span className="saas-settings-slug">Branch code: {branch.code} (fixed)</span>}
        </div>
        {!branchId ? (
          <div className="saas-empty-state"><span className="saas-empty-icon"><MdApartment /></span><strong>Choose a branch</strong><p>Select a branch from the top navigation to edit its contact details.</p></div>
        ) : loadingBranch ? <div className="saas-loading">Loading branch settings…</div> : (
          <>
            <div className="saas-form-grid">
              <TextField label="Branch name" value={branch.name} onChange={(value) => updateBranch("name", value)} required maxLength={120} disabled={editDisabled} />
              <TextField label="Contact email" value={branch.email} onChange={(value) => updateBranch("email", value)} type="email" maxLength={254} disabled={editDisabled} />
              <TextField label="Contact phone" value={branch.phone} onChange={(value) => updateBranch("phone", value)} type="tel" maxLength={30} disabled={editDisabled} />
              <TextField label="Website (HTTPS)" value={branch.website} onChange={(value) => updateBranch("website", value)} type="url" maxLength={300} placeholder="https://school.example" disabled={editDisabled} />
              <SelectField label="Branch time zone" value={branch.timezone} onChange={(value) => updateBranch("timezone", value)} disabled={editDisabled} options={[
                ["Asia/Kolkata", "India (Asia/Kolkata)"], ["Asia/Dubai", "UAE (Asia/Dubai)"], ["Asia/Singapore", "Singapore"], ["Europe/London", "United Kingdom"], ["America/New_York", "US Eastern"], ["Australia/Sydney", "Australia (Sydney)"],
              ]} />
            </div>
            <div className="saas-setting-subhead"><h4>Branch address</h4><p>Provide the branch address that families can recognize.</p></div>
            <AddressFields address={branch.address} setAddress={updateBranchAddress} disabled={editDisabled} />
            <div className="saas-form-actions">
              <button type="submit" className="saas-primary-button" disabled={editDisabled || savingBranch || loadingBranch}><MdSave /> {savingBranch ? "Saving…" : "Save branch settings"}</button>
            </div>
          </>
        )}
      </form>
      {!canManageOrganization && <p className="saas-muted-note">You can view these settings, but only the organization owner or head-office administrator can change them.</p>}
      <p className="saas-muted-note">Changing the organization’s currency is locked after fee invoices or payments exist so old financial records are not reinterpreted in a different currency.</p>
    </section>
  );
}
