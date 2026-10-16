import { useEffect, useState } from 'react';
import { adminApi } from '../adminApi';
import Relatorio from '../Relatorio';
import { useInstitutionOptions } from '../shared';

export default function AdminRelatorios() {
  const instituicoes = useInstitutionOptions();
  const [orgs, setOrgs] = useState([]);
  const [colecoes, setColecoes] = useState([]);
  useEffect(() => {
    adminApi.organizations().then(setOrgs).catch(() => {});
    adminApi.collections().then(setColecoes).catch(() => {});
  }, []);
  return (
    <Relatorio
      titulo="Relatórios"
      descricao="Dados consolidados de todas as instituições. Exportações ficam registradas na auditoria."
      institutions={instituicoes}
      organizations={orgs}
      colecoes={colecoes}
      linkMatricula={(id) => `/admin/matriculas/${id}`}
      api={{
        enrollments: adminApi.reportEnrollments,
        certificates: adminApi.reportCertificates,
        participation: adminApi.reportParticipation,
        exportCsv: adminApi.exportEnrollments,
      }}
    />
  );
}
