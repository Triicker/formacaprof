/** Domínio das contas de teste criadas pelo `seed:qa` (reservado: nunca recebe e-mail real). */
export const QA_DOMINIO = '@qa.formacaprof.test';

export const ehContaDeTeste = (email: string) => email.toLowerCase().endsWith(QA_DOMINIO);
