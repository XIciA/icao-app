import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AdminUsersController } from '../src/admin/admin-users.controller';
import type { DatabaseService } from '../src/database/database.service';
import type { CommerceService } from '../src/commerce/commerce.service';
import type { AdminAuditService } from '../src/admin/admin-audit.service';
import type { AdminGlobalResetService } from '../src/admin/admin-global-reset.service';
import type { OpsAuthenticatedRequest } from '../src/admin/admin.types';

async function search(query: string) {
  const execute = vi.fn().mockResolvedValue([{ rows: [], total: 0 }]);
  const record = vi.fn();
  const controller = new AdminUsersController(
    { db: { execute } } as unknown as DatabaseService,
    {} as CommerceService,
    { record } as unknown as AdminAuditService,
    {} as AdminGlobalResetService,
  );
  const response = await controller.list({ query }, {
    id: 'search-test', opsStaff: { id: 'admin', role: 'admin' },
  } as OpsAuthenticatedRequest);
  return { response, record, compiled: new PgDialect().sqlToQuery(execute.mock.calls[0]![0]) };
}

describe('admin username search', () => {
  it('accepts short Chinese names and searches the canonical synced profile', async () => {
    const { compiled, record } = await search('  许健  ');
    expect(compiled.sql).toContain("d.payload->>'displayName'");
    expect(compiled.sql).toContain("d.document_key='account_profile'");
    expect(compiled.sql).toMatch(/strpos\(lower\(coalesce\(u.display_name,''\)\),lower\(\$\d+\)\)>0/);
    expect(compiled.params).toContain('许健');
    expect(compiled.sql).not.toContain('许健');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ops.users.list' }));
  });
  it('binds names including SQL and wildcard characters as literal substrings', async () => {
    const name = "O'Brien_%\\";
    const { compiled } = await search(name);
    expect(compiled.params).toContain(name);
    expect(compiled.sql).not.toContain(name);
    expect(compiled.sql).not.toMatch(/display_name\s+(?:i?like)/);
  });
  it('preserves phone, account ID, order and empty-list search paths', async () => {
    const { compiled, response } = await search('');
    expect(compiled.sql).toContain('u.account_id::text=');
    expect(compiled.sql).toContain('u.phone like');
    expect(compiled.sql).toContain('o.external_order_id=');
    expect(compiled.sql).toContain('o.environment=');
    expect(response.data).toMatchObject({ rows: [], total: 0, page: 1, limit: 20 });
  });
});
