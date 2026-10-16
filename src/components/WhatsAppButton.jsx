// Número de suporte a definir com o cliente.
export const WHATSAPP_URL = 'https://wa.me/5500000000000?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20a%20Forma%C3%A7%C3%A3o%20para%20Professores';

export default function WhatsAppButton() {
  return (
    <a className="whatsapp-btn" href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Suporte via WhatsApp">
      <img src="/img/whatsapp.png" alt="" />
    </a>
  );
}
