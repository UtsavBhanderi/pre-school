'use strict';

const SUPPORTED_LOCALES = ['en-IN', 'en-GB', 'en-US', 'hi-IN', 'gu-IN'];
const SUPPORTED_CURRENCIES = ['INR', 'USD', 'GBP', 'AED', 'EUR', 'AUD', 'CAD', 'SGD'];
const SUPPORTED_LANGUAGES = ['en', 'hi', 'gu'];
const SUPPORTED_DATE_FORMATS = ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'];
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country'];

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validCurrency(value) {
  if (typeof value !== 'string' || !SUPPORTED_CURRENCIES.includes(value)) return false;
  try {
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: value }).format(1);
    return true;
  } catch {
    return false;
  }
}

function validEmail(value) {
  return !value || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function validPhone(value) {
  return !value || /^\+?[0-9 ()-]{7,30}$/.test(value);
}

function validWebsite(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function validateOrganizationProfile(input = {}, current = {}) {
  const errors = {};
  const value = {};

  const allowed = new Set(['name', 'timezone', 'locale', 'currency', 'contact', 'settings']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors[key] = 'This organization field cannot be changed here.';
  }

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    const name = cleanText(input.name, 120);
    if (name.length < 2) errors.name = 'Organization name must contain at least 2 characters.';
    else value.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'timezone')) {
    const timezone = cleanText(input.timezone, 100);
    if (!validTimezone(timezone)) errors.timezone = 'Choose a valid time zone.';
    else value.timezone = timezone;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'locale')) {
    const locale = cleanText(input.locale, 20);
    if (!SUPPORTED_LOCALES.includes(locale)) errors.locale = 'Choose a supported display locale.';
    else value.locale = locale;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'currency')) {
    const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    const unchangedExistingCurrency = currency && currency === current.currency;
    if (!unchangedExistingCurrency && !validCurrency(currency)) errors.currency = 'Choose a supported currency: INR, USD, GBP, AED, EUR, AUD, CAD or SGD.';
    else if (currency !== current.currency) value.currency = currency;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'contact')) {
    if (!input.contact || typeof input.contact !== 'object' || Array.isArray(input.contact)) {
      errors.contact = 'Contact details must be an object.';
    } else {
      const currentContact = current.contact || {};
      const contact = {};
      const contactAllowed = new Set(['email', 'phone', 'website', 'address']);
      for (const key of Object.keys(input.contact)) {
        if (!contactAllowed.has(key)) errors['contact.' + key] = 'This contact field cannot be changed here.';
      }
      if (Object.prototype.hasOwnProperty.call(input.contact, 'email')) {
        const email = cleanText(input.contact.email, 254).toLowerCase();
        if (!validEmail(email)) errors.contactEmail = 'Enter a valid contact email address.';
        else contact.email = email;
      }
      if (Object.prototype.hasOwnProperty.call(input.contact, 'phone')) {
        const phone = cleanText(input.contact.phone, 30);
        if (!validPhone(phone)) errors.contactPhone = 'Enter a valid contact phone number.';
        else contact.phone = phone;
      }
      if (Object.prototype.hasOwnProperty.call(input.contact, 'website')) {
        const website = cleanText(input.contact.website, 300);
        if (!validWebsite(website)) errors.contactWebsite = 'Enter a website using HTTPS.';
        else contact.website = website;
      }
      if (Object.prototype.hasOwnProperty.call(input.contact, 'address')) {
        const addressInput = input.contact.address;
        if (!addressInput || typeof addressInput !== 'object' || Array.isArray(addressInput)) {
          errors.contactAddress = 'Address must be an object.';
        } else {
          const address = {};
          for (const key of Object.keys(addressInput)) {
            if (!ADDRESS_FIELDS.includes(key)) errors['contact.address.' + key] = 'This address field cannot be changed here.';
          }
          for (const key of ADDRESS_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(addressInput, key)) {
              address[key] = cleanText(addressInput[key], key === 'country' || key === 'city' || key === 'state' ? 100 : 160);
            } else if (Object.prototype.hasOwnProperty.call(currentContact.address || {}, key)) {
              address[key] = currentContact.address[key];
            }
          }
          if (!address.country) address.country = 'India';
          contact.address = address;
        }
      }
      value.contact = contact;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'settings')) {
    if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) {
      errors.settings = 'Organization preferences must be an object.';
    } else {
      const currentSettings = current.settings || {};
      const settings = {};
      const settingsAllowed = new Set(['academicYearStartMonth', 'dateFormat', 'defaultLanguage']);
      for (const key of Object.keys(input.settings)) {
        if (!settingsAllowed.has(key)) errors['settings.' + key] = 'This preference cannot be changed here.';
      }
      if (Object.prototype.hasOwnProperty.call(input.settings, 'academicYearStartMonth')) {
        const month = Number(input.settings.academicYearStartMonth);
        if (!Number.isInteger(month) || month < 1 || month > 12) errors.academicYearStartMonth = 'Academic-year start month must be between 1 and 12.';
        else settings.academicYearStartMonth = month;
      }
      if (Object.prototype.hasOwnProperty.call(input.settings, 'dateFormat')) {
        const format = cleanText(input.settings.dateFormat, 20);
        if (!SUPPORTED_DATE_FORMATS.includes(format)) errors.dateFormat = 'Choose a supported date format.';
        else settings.dateFormat = format;
      }
      if (Object.prototype.hasOwnProperty.call(input.settings, 'defaultLanguage')) {
        const language = cleanText(input.settings.defaultLanguage, 5);
        if (!SUPPORTED_LANGUAGES.includes(language)) errors.defaultLanguage = 'Choose English, Hindi or Gujarati.';
        else settings.defaultLanguage = language;
      }
      value.settings = settings;
    }
  }

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, value };
}

function validateBranchProfile(input = {}) {
  const errors = {};
  const value = {};
  const allowed = new Set(['name', 'timezone', 'phone', 'email', 'website', 'address']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors[key] = 'This branch field cannot be changed here.';
  }

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    const name = cleanText(input.name, 120);
    if (name.length < 2) errors.name = 'Branch name must contain at least 2 characters.';
    else value.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'timezone')) {
    const timezone = cleanText(input.timezone, 100);
    if (!validTimezone(timezone)) errors.timezone = 'Choose a valid time zone.';
    else value.timezone = timezone;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'phone')) {
    const phone = cleanText(input.phone, 30);
    if (!validPhone(phone)) errors.phone = 'Enter a valid branch phone number.';
    else value.phone = phone;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'email')) {
    const email = cleanText(input.email, 254).toLowerCase();
    if (!validEmail(email)) errors.email = 'Enter a valid branch email address.';
    else value.email = email;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'website')) {
    const website = cleanText(input.website, 300);
    if (!validWebsite(website)) errors.website = 'Enter a website using HTTPS.';
    else value.website = website;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'address')) {
    const addressInput = input.address;
    if (!addressInput || typeof addressInput !== 'object' || Array.isArray(addressInput)) {
      errors.address = 'Address must be an object.';
    } else {
      const address = {};
      for (const key of Object.keys(addressInput)) {
        if (!ADDRESS_FIELDS.includes(key)) errors['address.' + key] = 'This address field cannot be changed here.';
      }
      for (const key of ADDRESS_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(addressInput, key)) {
          address[key] = cleanText(addressInput[key], key === 'country' || key === 'city' || key === 'state' ? 100 : 160);
        }
      }
      if (!address.country) address.country = 'India';
      value.address = address;
    }
  }

  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, value };
}

module.exports = {
  SUPPORTED_LOCALES,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_DATE_FORMATS,
  validTimezone,
  validCurrency,
  validateOrganizationProfile,
  validateBranchProfile,
};
