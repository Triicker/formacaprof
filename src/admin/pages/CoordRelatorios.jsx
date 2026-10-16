import { useEffect, useState } from 'react';
import { coordApi } from '../adminApi';
import Relatorio from '../Relatorio';
import { useCoordInstitution } from './CoordArea';

export default function CoordRelatorios() {
  const inst = useCoordInstitution();
  const [colecoes, setColecoes] = useState([]);
  useEffect(() => { coordApi.collections(inst.id).then((r) => setColecoes(r.items)).catch(() => setColecoes([])); }, [inst.id]);
  return (
    <Relatorio
      titulo="Relatórios"
      descricao={`Dados de ${inst.nome}. Exportações ficam registradas na auditoria.`}
      colecoes={colecoes}
      api={{
        enrollments: (p) => coordApi.reportEnrollments(inst.id, p),
        certificates: (p) => coordApi.reportCertificates(inst.id, p),
        participation: (p) => coordApi.reportParticipation(inst.id, p),
        exportCsv: (p) => coordApi.exportEnrollments(inst.id, p),
      }}
    />
  );
}
