'use strict';

function buildOwnerSetupChecklist({ organization, branches, counts = {}, branch = null, now = new Date() }) {
  const scopedBranches = Array.isArray(branches) ? branches : [];
  const activeClasses = Number(counts.activeClasses) || 0;
  const childCount = Number(counts.childCount) || 0;
  const attendanceCount = Number(counts.attendanceCount) || 0;
  const invoiceCount = Number(counts.invoiceCount) || 0;
  const paymentCount = Number(counts.paymentCount) || 0;
  const staffCount = Number(counts.staffCount) || 0;
  const parentCount = Number(counts.parentCount) || 0;
  const contact = organization?.contact || {};
  const address = contact.address || {};

  const organizationProfileComplete = Boolean(
    String(contact.email || '').trim() &&
    String(contact.phone || '').trim() &&
    String(address.city || '').trim()
  );
  const branchProfilesComplete = scopedBranches.length > 0 && scopedBranches.every((item) =>
    Boolean(String(item.phone || '').trim() && String(item.address?.city || '').trim())
  );

  const steps = [
    {
      id: 'organization-profile',
      title: 'Add your school contact details',
      description: 'Enter a contact email, phone number and city so your organization is clearly identified.',
      completed: organizationProfileComplete,
      required: true,
      tab: 'settings',
      buttonLabel: 'Edit organization details',
    },
    {
      id: 'branch-profile',
      title: 'Complete branch contact details',
      description: 'Add a local contact phone and city for each active branch.',
      completed: branchProfilesComplete,
      required: false,
      tab: 'settings',
      buttonLabel: 'Review branch details',
    },
    {
      id: 'classes',
      title: 'Set up at least one class',
      description: 'Create your class list, then set age rules, capacity and the default fee for each class.',
      completed: activeClasses > 0,
      required: true,
      tab: 'classes',
      buttonLabel: 'Set up classes',
      count: activeClasses,
    },
    {
      id: 'children',
      title: 'Register your first child',
      description: 'Add a child and link the correct parent or guardian contact.',
      completed: childCount > 0,
      required: true,
      tab: 'children',
      buttonLabel: 'Register a child',
      count: childCount,
    },
    {
      id: 'attendance',
      title: 'Save a day of attendance',
      description: 'Choose a date and class, mark every child present or absent, and save.',
      completed: attendanceCount > 0,
      required: true,
      tab: 'attendance',
      buttonLabel: 'Take attendance',
      count: attendanceCount,
    },
    {
      id: 'fees',
      title: 'Create your first fee invoice',
      description: 'Create a fee invoice for a child; the balance is calculated from recorded payments and refunds.',
      completed: invoiceCount > 0,
      required: true,
      tab: 'fees',
      buttonLabel: 'Set up fees',
      count: invoiceCount,
    },
    {
      id: 'team',
      title: 'Invite your team',
      description: 'Invite staff with only the branches, classes and responsibilities they need.',
      completed: staffCount > 0,
      required: false,
      tab: 'team',
      buttonLabel: 'Manage staff access',
      count: staffCount,
    },
    {
      id: 'payment',
      title: 'Record your first payment',
      description: 'Record a payment only after money has actually been received, then give the family a receipt.',
      completed: paymentCount > 0,
      required: false,
      tab: 'fees',
      buttonLabel: 'Record a payment',
      count: paymentCount,
    },
    {
      id: 'parent-portal',
      title: 'Connect a parent portal account',
      description: 'Invite a verified guardian so they can see only their linked child and permitted billing records.',
      completed: parentCount > 0,
      required: false,
      tab: 'team',
      buttonLabel: 'Invite a parent',
      count: parentCount,
    },
  ];

  const requiredSteps = steps.filter((step) => step.required);
  const requiredCompleted = requiredSteps.filter((step) => step.completed).length;
  return {
    organization: {
      id: String(organization?._id || organization?.id || ''),
      name: organization?.name || '',
    },
    branchScope: branch
      ? { id: String(branch._id || branch.id), name: branch.name }
      : { id: null, name: 'All permitted branches' },
    progress: {
      completedRequired: requiredCompleted,
      totalRequired: requiredSteps.length,
      percent: Math.round((requiredCompleted / requiredSteps.length) * 100),
      isReady: requiredCompleted === requiredSteps.length,
    },
    steps,
    generatedAt: now.toISOString(),
  };
}

module.exports = { buildOwnerSetupChecklist };
