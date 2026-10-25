'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const freeze = require('./freeze-baseline-o3.cjs');

function fixture(options = {}) {
  let tag = options.existing ?? null;
  const writes = [];
  const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
  return {
    writes,
    args: {
      context: { repo: options.repo ?? { owner: 'rlases', repo: 'SecureQR-ID' } },
      core: { info() {} },
      github: { async request(route, args) {
        if (route.endsWith('/git/ref/{ref}')) {
          assert.equal(args.ref, 'tags/baseline-o3');
          if (!tag) throw httpError(404);
          return { data: { object: { type: options.annotated ? 'tag' : 'commit', sha: tag } } };
        }
        if (route.endsWith('/git/tags/{tag_sha}')) return { data: { object: { type: 'commit', sha: freeze.TARGET } } };
        if (route.endsWith('/compare/{basehead}')) {
          assert.equal(args.basehead, `${freeze.TARGET}...main`);
          return { data: { status: options.status ?? 'identical' } };
        }
        if (route.endsWith('/contents/{path}')) {
          assert.equal(args.ref, freeze.TARGET);
          assert.equal(args.path, 'mi-app-qr/server/src/titulares');
          if (options.controlsPresent) return { data: [] };
          throw httpError(options.contentsError ?? 404);
        }
        if (route.startsWith('POST ')) {
          writes.push({ ...args });
          if (options.race) {
            tag = options.race === 'same' ? freeze.TARGET : 'b'.repeat(40);
            throw httpError(422);
          }
          tag = args.sha;
          return { data: {} };
        }
        throw new Error(`Operación inesperada: ${route}`);
      } },
    },
  };
}

test('crea solo la referencia exacta y es idempotente', async () => {
  const f = fixture();
  assert.deepEqual(await freeze(f.args), { created: true, commit: freeze.TARGET });
  assert.deepEqual(f.writes, [{ owner: 'rlases', repo: 'SecureQR-ID', ref: 'refs/tags/baseline-o3', sha: freeze.TARGET }]);
  assert.deepEqual(await freeze(f.args), { created: false, commit: freeze.TARGET });
  assert.equal(f.writes.length, 1);
});
test('no sobrescribe una etiqueta diferente', async () => {
  const f = fixture({ existing: 'b'.repeat(40) });
  await assert.rejects(freeze(f.args), /otro commit/);
  assert.equal(f.writes.length, 0);
});
test('reconoce una etiqueta anotada que resuelve al commit previsto', async () => {
  const f = fixture({ existing: 'c'.repeat(40), annotated: true });
  assert.equal((await freeze(f.args)).created, false);
  assert.equal(f.writes.length, 0);
});
test('rechaza un commit ajeno a main', async () => {
  const f = fixture({ status: 'diverged' });
  await assert.rejects(freeze(f.args), /antecesor/);
  assert.equal(f.writes.length, 0);
});
test('rechaza una versión que ya tiene titulares', async () => {
  const f = fixture({ controlsPresent: true });
  await assert.rejects(freeze(f.args), /ya contiene/);
  assert.equal(f.writes.length, 0);
});
test('un error de permisos no se confunde con ausencia del directorio', async () => {
  const f = fixture({ contentsError: 403 });
  await assert.rejects(freeze(f.args), /HTTP 403/);
  assert.equal(f.writes.length, 0);
});
test('solo acepta una carrera de creación si el commit coincide', async () => {
  const same = fixture({ race: 'same' });
  assert.equal((await freeze(same.args)).created, false);
  const different = fixture({ race: 'different' });
  await assert.rejects(freeze(different.args), /HTTP 422/);
});
test('no opera sobre un fork ni otro repositorio', async () => {
  const f = fixture({ repo: { owner: 'otra-cuenta', repo: 'SecureQR-ID' } });
  await assert.rejects(freeze(f.args), /solo corresponde/);
  assert.equal(f.writes.length, 0);
});
