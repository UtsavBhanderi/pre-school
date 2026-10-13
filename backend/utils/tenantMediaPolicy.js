'use strict';

const STAFF_WORKSPACE_ROLES = [
  'organization_owner',
  'head_office_admin',
  'branch_admin',
  'admissions',
  'teacher',
  'accountant',
  'hr_manager',
  'transport_staff',
];

const MEDIA_MANAGER_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'];
const STAFF_MEDIA_MANAGER_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'hr_manager'];

function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

function activeMemberOfBranch(membership, organizationId, branchId) {
  if (!membership || membership.status !== 'active') return false;
  if (String(membership.organizationId) !== String(organizationId)) return false;
  if (membership.accessAllBranches === true) return true;
  return Array.isArray(membership.branchIds) &&
    membership.branchIds.some((id) => idOf(id) === String(branchId));
}

function canUploadMedia({ membership, category }) {
  if (membership?.status !== 'active') return false;
  if (category === 'child_photo' || category === 'gallery_image' ||
      category === 'learning_pdf' || category === 'learning_video') {
    return MEDIA_MANAGER_ROLES.includes(membership.role);
  }
  if (category === 'staff_photo') return STAFF_MEDIA_MANAGER_ROLES.includes(membership.role);
  return false;
}

function canReadMedia({ membership, asset, parentHasPhotoConsent = false }) {
  if (membership?.status !== 'active' || !asset || asset.status !== 'active') return false;
  if (!STAFF_WORKSPACE_ROLES.includes(membership.role) && membership.role !== 'parent') return false;

  if (membership.role === 'parent') {
    return asset.category === 'child_photo' &&
      asset.audience === 'parent_with_photo_consent' &&
      Boolean(asset.childId) &&
      parentHasPhotoConsent === true &&
      Array.isArray(membership.guardianIds) &&
      membership.guardianIds.length > 0;
  }

  if (asset.category === 'staff_photo') {
    if (['organization_owner', 'head_office_admin', 'branch_admin', 'hr_manager'].includes(membership.role)) return true;
    return Boolean(asset.staffUserId && String(asset.staffUserId) === String(membership.userId));
  }
  if (asset.category === 'child_photo' && membership.role === 'teacher') {
    const assignedClasses = Array.isArray(membership.classNames) ? membership.classNames : [];
    return Boolean(asset.className && assignedClasses.includes(asset.className));
  }
  return true;
}

module.exports = {
  STAFF_WORKSPACE_ROLES,
  MEDIA_MANAGER_ROLES,
  STAFF_MEDIA_MANAGER_ROLES,
  idOf,
  activeMemberOfBranch,
  canUploadMedia,
  canReadMedia,
};
