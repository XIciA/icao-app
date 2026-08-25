import { runOpsStaffProvision } from '../src/admin/admin-provisioning';

await runOpsStaffProvision();
process.stdout.write('ops_staff_provisioned\n');
