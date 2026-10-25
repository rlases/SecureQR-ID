'use strict';

// Issue #78: referencia anterior al primer cambio de ADR-0016 en mi-app-qr.
// No se calcula desde una rama que pueda avanzar ni se sobrescribe un tag existente.
const TARGET = '1b4498af0d2a76ceeadce0a114c40d9d758c7aab';
const TAG = 'baseline-o3';
const REPOSITORY = { owner: 'rlases', repo: 'SecureQR-ID' };

module.exports = async function freezeBaseline({ github, context, core }) {
  if (context.repo.owner !== REPOSITORY.owner || context.repo.repo !== REPOSITORY.repo) {
    throw new Error('Este procedimiento solo corresponde a rlases/SecureQR-ID.');
  }
  const api = (route, args = {}) => github.request(route, { ...REPOSITORY, ...args });
  const resolveTag = async () => {
    let object;
    try {
      object = (await api('GET /repos/{owner}/{repo}/git/ref/{ref}', { ref: `tags/${TAG}` })).data.object;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
    for (let depth = 0; depth < 8 && object.type === 'tag'; depth++) {
      object = (await api('GET /repos/{owner}/{repo}/git/tags/{tag_sha}', { tag_sha: object.sha })).data.object;
    }
    if (object.type !== 'commit') throw new Error('La etiqueta no resuelve a un commit.');
    return object.sha;
  };
  const existing = await resolveTag();
  if (existing !== null) {
    if (existing !== TARGET) throw new Error('baseline-o3 ya apunta a otro commit; no se modifica.');
    core.info(`baseline-o3 ya corresponde a ${TARGET}.`);
    return { created: false, commit: TARGET };
  }

  // Debe ser una versión de main, no un commit de las ramas de implementación.
  const comparison = (await api('GET /repos/{owner}/{repo}/compare/{basehead}', {
    basehead: `${TARGET}...main`,
  })).data;
  if (!['identical', 'ahead'].includes(comparison.status)) {
    throw new Error('El commit de línea base no es antecesor de main.');
  }
  // Una línea base no puede contener ya el registro de titulares de ADR-0016.
  try {
    await api('GET /repos/{owner}/{repo}/contents/{path}', {
      path: 'mi-app-qr/server/src/titulares', ref: TARGET,
    });
    throw new Error('El commit ya contiene el registro de titulares; no se etiqueta.');
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  try {
    await api('POST /repos/{owner}/{repo}/git/refs', { ref: `refs/tags/${TAG}`, sha: TARGET });
  } catch (error) {
    // Si otra ejecución creó la etiqueta entre ambas lecturas, solo aceptar el mismo commit.
    if (error.status !== 422 || await resolveTag() !== TARGET) throw error;
    core.info(`baseline-o3 ya fue creada para ${TARGET}.`);
    return { created: false, commit: TARGET };
  }
  core.info(`baseline-o3 fijada en ${TARGET}.`);
  return { created: true, commit: TARGET };
};

module.exports.TARGET = TARGET;
