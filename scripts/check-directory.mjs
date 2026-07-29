import { getDeptCatalog, lookupStaff, resolveDeptCodes, matchRole, findDeptCodesForRole } from "../lib/staffDirectory.ts";
import { getOrgUnitById } from "../lib/orgUnits.ts";

const catalog = await getDeptCatalog();
console.log("catalog entries:", catalog.length);

const vpCodes = findDeptCodesForRole("vice president", catalog);
const vps = matchRole(await lookupStaff({ deptCodes: vpCodes }), "vice president");
console.log("\nVice Presidents:");
for (const v of vps) console.log(` - ${v.name} :: ${v.adminPosition} :: ${v.email}`);

const rgoCodes = resolveDeptCodes(getOrgUnitById("registrar"), catalog);
const registrar = matchRole(await lookupStaff({ deptCodes: rgoCodes }), "registrar");
console.log("\nRegistrar:");
for (const r of registrar) console.log(` - ${r.name} :: ${r.adminPosition} :: ${r.email}`);
