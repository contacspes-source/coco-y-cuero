/** Datos de contacto del negocio. Cámbialos aquí y en ningún otro lado. */
export const CONFIG = {
  // Con lada de país, sin + ni espacios. México = 52.
  whatsapp: "522206172818",
  instagram: "https://instagram.com/cocoycuero",
  facebook: "https://facebook.com/cocoycuero",
};

export const linkWhatsApp = (texto: string) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(texto)}`;
