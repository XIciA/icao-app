import { runOpsStaffProvision } from '../src/admin/admin-provisioning';

runOpsStaffProvision().then(
  () => process.stdout.write('ops_staff_provisioned\n'),
  () => {
    process.stderr.write('ops_staff_provision_failed\n');
    process.exitCode = 1;
  },
);
