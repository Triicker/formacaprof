-- AlterEnum
ALTER TYPE "CompletionSource" ADD VALUE 'admin_correction';

-- Trilha de auditoria append-only: registros não podem ser alterados nem apagados.
-- (Usuários e instituições não são excluídos fisicamente — política de retenção; anonimização é feita por atualização dos dados pessoais.)
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é somente inclusão (operação % bloqueada)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
