import argon2 from 'argon2';

export class StudentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const nameParticles = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function passwordNameParts(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new StudentError(400, 'Informe primeiro e segundo nome válidos.');
  }
  const [first, ...remaining] = name.trim().split(/\s+/u);
  const second = remaining.flatMap(part => part.split('-'))
    .find(part => part && !nameParticles.has(part.toLowerCase()));
  if (!second) throw new StudentError(400, 'Informe primeiro e segundo nome válidos.');
  return [first, second];
}

export function validateStudent(body, adminEmail) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['name', 'registrationNumber', 'email', 'confirmed'].includes(key))) {
    throw new StudentError(400, 'Dados do aluno inválidos.');
  }
  const { name, registrationNumber, email } = body;
  if ([name, registrationNumber, email].some((value) => typeof value !== 'string' || !value.trim())) {
    throw new StudentError(400, 'Nome, matrícula e email são obrigatórios.');
  }
  const cleanName = name.trim().replace(/\s+/gu, ' ');
  const parts = cleanName.split(' ');
  if (cleanName.length > 200 || parts.length < 2
    || parts.some((part) => !/^\p{L}[\p{L}\p{M}]*(?:[-'’]\p{L}[\p{L}\p{M}]*)*$/u.test(part))) {
    throw new StudentError(400, 'Informe nome e sobrenome válidos, com até 200 caracteres.');
  }
  passwordNameParts(cleanName);
  const registration = registrationNumber.trim();
  if (registration.length > 64 || /[\s\p{C}]/u.test(registration)) {
    throw new StudentError(400, 'A matrícula deve ter até 64 caracteres e não conter espaços.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const local = normalizedEmail.split('@')[0];
  if (normalizedEmail.length > 254
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@alunos\.unicerrado\.edu\.br$/.test(normalizedEmail)
    || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    throw new StudentError(400, 'Informe um email válido de @alunos.unicerrado.edu.br.');
  }
  if (normalizedEmail === adminEmail) throw new StudentError(409, 'O email está reservado ao administrador.');
  return { name: cleanName, registrationNumber: registration, email: normalizedEmail };
}

export function initialPassword(name) {
  const [firstPart, secondPart] = passwordNameParts(name);
  const normalize = (part) => part.normalize('NFD').replace(/\p{M}/gu, '').replace(/-/gu, '').toLowerCase();
  const first = normalize(firstPart);
  return `${first[0].toUpperCase()}${first.slice(1)}.${normalize(secondPart)}@2026`;
}

export function validateStudentId(value) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new StudentError(400, 'Identificador de aluno inválido.');
  }
  return value;
}

export function createStudentService(repository, config) {
  return {
    list: () => repository.list(),
    async add(body) {
      const data = validateStudent(body, config.email);
      if (body.confirmed !== true) throw new StudentError(400, 'Confirme a adição do aluno.');
      const password = initialPassword(data.name);
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      const student = await repository.add(data, hash);
      return { student, initialPassword: password };
    },
    async edit(id, body) {
      validateStudentId(id);
      const data = validateStudent(body, config.email);
      const student = await repository.edit(id, data);
      if (!student) throw new StudentError(404, 'Aluno não encontrado.');
      return { student };
    },
    async dismiss(id, body) {
      validateStudentId(id);
      if (!body || body.confirmed !== true || Object.keys(body).some((key) => key !== 'confirmed')) {
        throw new StudentError(400, 'Confirme o desligamento do aluno.');
      }
      const student = await repository.dismiss(id);
      if (!student) throw new StudentError(404, 'Aluno não encontrado ou já desligado.');
      return { student };
    },
  };
}
