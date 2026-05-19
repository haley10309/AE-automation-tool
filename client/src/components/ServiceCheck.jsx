// ════════════════════════════════════════════════════════════════
// ── 서비스 운영 데이터 (하드코딩) ─────────────────────────────
// ── [삽입 위치] CountryTab.jsx 상단 import 블록 바로 아래 ─────
// ════════════════════════════════════════════════════════════════
//
// 4가지 서비스: samsungHealth / appsServices / carePlus / tradeIn
// null = 해당 국가 미운영
// ────────────────────────────────────────────────────────────────

export const SERVICE_KEYS = [
  { key: 'samsungHealth', label: 'Samsung Health' },
  { key: 'appsServices',  label: 'Apps & Services' },
  { key: 'carePlus',      label: 'Samsung Care+' },
  { key: 'tradeIn',       label: 'Samsung Trade-in' },
]

export const SERVICE_DATA = {
  // ── Americas ──────────────────────────────────────────────────
  CA_FR:     { samsungHealth: { text: 'Samsung Health',              url: '/ca_fr/apps/samsung-health/'          }, appsServices: { text: 'Applications et services',    url: '/ca_fr/apps/'                          }, carePlus: { text: 'Samsung Care+', url: '/ca_fr/offer/samsung-care-plus/'  }, tradeIn: { text: 'Samsung Trade-in',          url: '/ca_fr/trade-in/'                     } },
  CA:        { samsungHealth: { text: 'Samsung Health',              url: '/ca/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/ca/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/ca/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/ca/trade-in/'                        } },
  MX:        { samsungHealth: { text: 'Samsung Health',              url: '/mx/apps/samsung-health/'             }, appsServices: { text: 'Aplicaciones y servicios',     url: '/mx/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/mx/offer/samsung-care-plus/'    }, tradeIn: { text: 'Galaxy Canje',              url: '/mx/offer/we-take-your-smartphone/'    } },
  BR:        { samsungHealth: { text: 'Samsung Health',              url: '/br/apps/samsung-health/'             }, appsServices: { text: 'Aplicativos e Serviços',       url: '/br/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/br/offer/samsung-care-plus/'    }, tradeIn: { text: 'Troca Smart Samsung',       url: '/br/trade-in/'                        } },
  LATIN:     { samsungHealth: { text: 'Samsung Health',              url: '/latin/apps/samsung-health/'          }, appsServices: { text: 'Aplicaciones y servicios',     url: '/latin/apps/'                          }, carePlus: null,                                                                  tradeIn: null },
  LATIN_EN:  { samsungHealth: { text: 'Samsung Health',              url: '/latin_en/apps/samsung-health/'       }, appsServices: { text: 'Apps & Services',              url: '/latin_en/apps/'                       }, carePlus: null,                                                                  tradeIn: null },
  CO:        { samsungHealth: { text: 'Samsung Health',              url: '/co/apps/samsung-health/'             }, appsServices: { text: 'Aplicaciones y Servicios',     url: '/co/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/co/offer/samsung-care-plus/'    }, tradeIn: { text: 'Estreno y Entrego',         url: '/co/trade-in/'                        } },
  AR:        { samsungHealth: { text: 'Samsung Health',              url: '/ar/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/ar/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/ar/offer/samsung-care-plus/'    }, tradeIn: { text: 'Plan Canje',                url: '/ar/campaign/plan-canje-online/'       } },
  PY:        { samsungHealth: { text: 'Samsung Health',              url: '/py/apps/samsung-health/'             }, appsServices: { text: 'Aplicaciones y servicios',     url: '/py/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/py/offer/trade-in/'                  } },
  UY:        { samsungHealth: { text: 'Samsung Health',              url: '/uy/apps/samsung-health/'             }, appsServices: { text: 'Aplicaciones y servicios',     url: '/uy/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  CL:        { samsungHealth: { text: 'Samsung Health',              url: '/cl/apps/samsung-health/'             }, appsServices: { text: 'Apps y Servicios',             url: '/cl/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/cl/campaign/samsung-care-plus/' }, tradeIn: { text: 'Recicla y Ahorra',          url: '/cl/trade-in/'                        } },
  PE:        { samsungHealth: { text: 'Samsung Health',              url: '/pe/apps/samsung-health/'             }, appsServices: { text: 'Apps y Servicios',             url: '/pe/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/pe/offer/samsung-care-plus/'    }, tradeIn: { text: 'Plan Canje',                url: '/pe/trade-in/'                        } },

  // ── Asia Pacific ──────────────────────────────────────────────
  SG:        { samsungHealth: { text: 'Samsung Health',              url: '/sg/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/sg/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/sg/offer/samsung-care-plus/mobile/' }, tradeIn: { text: 'Samsung Trade-in',      url: '/sg/trade-in/'                        } },
  AU:        { samsungHealth: { text: 'Samsung Health',              url: '/au/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/au/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/au/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/au/trade-in/'                        } },
  NZ:        { samsungHealth: { text: 'Samsung Health',              url: '/nz/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/nz/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/nz/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/nz/offer/galaxytradein/'              } },
  ID:        { samsungHealth: { text: 'Samsung Health',              url: '/id/apps/samsung-health/'             }, appsServices: { text: 'Aplikasi & Layanan',           url: '/id/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/id/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/id/offer/mobile-trade-in/'            } },
  TH:        { samsungHealth: { text: 'Samsung Health',              url: '/th/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/th/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/th/offer/samsung-care-plus/'    }, tradeIn: { text: 'เก่าแลกใหม่ สมาร์ทโฟน',     url: '/th/tradeinpromotion/'                 } },
  MM:        { samsungHealth: { text: 'Samsung Health',              url: '/mm/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/mm/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/mm/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/mm/offer/tradeup_program/'            } },
  VN:        { samsungHealth: { text: 'Samsung Health',              url: '/vn/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/vn/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/vn/offer/samsung-care-plus/'    }, tradeIn: { text: 'Thu cũ đổi mới',            url: '/vn/offer/len-doi-sieu-pham/'          } },
  MY:        { samsungHealth: { text: 'Samsung Health',              url: '/my/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/my/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/my/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/my/trade-in/'                        } },
  PH:        { samsungHealth: { text: 'Samsung Health',              url: '/ph/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/ph/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/ph/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/ph/trade-in/'                        } },
  JP:        { samsungHealth: { text: 'Samsung Health',              url: '/jp/apps/samsung-health/'             }, appsServices: { text: 'アプリ＆サービス',               url: '/jp/apps/'                             }, carePlus: { text: 'Galaxy Care',   url: '/jp/offer/galaxy-care/'          }, tradeIn: { text: 'Samsung下取りサービス',        url: '/jp/trade-in/'                        } },
  IN:        { samsungHealth: { text: 'Samsung Health',              url: '/in/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/in/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/in/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/in/offer/exchange/'                  } },
  BD:        { samsungHealth: { text: 'Samsung Health',              url: '/bd/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/bd/apps/'                             }, carePlus: null,                                                                  tradeIn: null },

  // ── Middle East & Africa ──────────────────────────────────────
  AE:        { samsungHealth: { text: 'Samsung Health',              url: '/ae/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/ae/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/ae/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/ae/offer/mobile-trade-in/'            } },
  AE_AR:     { samsungHealth: { text: 'Samsung Health',              url: '/ae_ar/apps/samsung-health/'          }, appsServices: { text: 'التطبيقات والخدمات',           url: '/ae_ar/apps/'                          }, carePlus: { text: 'Samsung Care+', url: '/ae_ar/offer/samsung-care-plus/' }, tradeIn: { text: 'استبدال أجهزة Samsung',    url: '/ae_ar/offer/mobile-trade-in/'         } },
  IL:        { samsungHealth: { text: 'Samsung Health',              url: '/il/apps/samsung-health/'             }, appsServices: { text: 'אפליקציות ושירותים',           url: '/il/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  PS:        { samsungHealth: { text: 'Samsung Health',              url: '/ps/apps/samsung-health/'             }, appsServices: { text: 'التطبيقات والخدمات',           url: '/ps/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  SA:        { samsungHealth: { text: 'Samsung Health',              url: '/sa/apps/samsung-health/'             }, appsServices: { text: 'التطبيقات والخدمات',           url: '/sa/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/sa/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/sa/offer/mobile-trade-in/'            } },
  SA_EN:     { samsungHealth: { text: 'Samsung Health',              url: '/sa_en/apps/samsung-health/'          }, appsServices: { text: 'Apps & Services',              url: '/sa_en/apps/'                          }, carePlus: { text: 'Samsung Care+', url: '/sa_en/offer/samsung-care-plus/' }, tradeIn: { text: 'Samsung Trade-in',          url: '/sa_en/offer/mobile-trade-in/'         } },
  TR:        { samsungHealth: { text: 'Samsung Health',              url: '/tr/apps/samsung-health/'             }, appsServices: { text: 'Uygulamalar & Hizmetler',      url: '/tr/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/tr/offer/samsung-care-plus/'    }, tradeIn: { text: 'Değişim Kampanyası',        url: '/tr/offer/mobile-trade-in/'            } },
  IRAN:      { samsungHealth: { text: 'Samsung Health',              url: '/iran/apps/samsung-health/'           }, appsServices: { text: 'Apps & Services',              url: '/iran/apps/'                           }, carePlus: null,                                                                  tradeIn: null },
  LEVANT:    { samsungHealth: { text: 'Samsung Health',              url: '/levant/apps/samsung-health/'         }, appsServices: { text: 'Apps & Services',              url: '/levant/apps/'                         }, carePlus: null,                                                                  tradeIn: null },
  LEVANT_AR: { samsungHealth: { text: 'Samsung Health',              url: '/levant_ar/apps/samsung-health/'      }, appsServices: { text: 'التطبيقات والخدمات',           url: '/levant_ar/apps/'                      }, carePlus: null,                                                                  tradeIn: null },
  IQ_AR:     { samsungHealth: { text: 'Samsung Health',              url: '/iq_ar/apps/samsung-health/'          }, appsServices: { text: 'التطبيقات والخدمات',           url: '/iq_ar/apps/'                          }, carePlus: null,                                                                  tradeIn: null },
  IQ_KU:     { samsungHealth: { text: 'Samsung Health',              url: '/iq_ku/apps/samsung-health/'          }, appsServices: { text: 'خزمەتگوزارییەکان',             url: '/iq_ku/apps/'                          }, carePlus: null,                                                                  tradeIn: null },
  LB:        { samsungHealth: { text: 'Samsung Health',              url: '/lb/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/lb/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/lb/offer/samsung-care-plus/'    }, tradeIn: null },
  PK:        { samsungHealth: { text: 'Samsung Health',              url: '/pk/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/pk/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/pk/trade-in/'                        } },
  EG:        { samsungHealth: { text: 'Samsung Health',              url: '/eg/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/eg/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  N_AFRICA:  { samsungHealth: { text: 'Samsung Health',              url: '/n_africa/apps/samsung-health/'       }, appsServices: { text: 'Apps & Services',              url: '/n_africa/apps/'                       }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/n_africa/offer/mobile-trade-in/'      } },
  AFRICA_EN: { samsungHealth: { text: 'Samsung Health',              url: '/africa_en/apps/samsung-health/'      }, appsServices: { text: 'Apps & Services',              url: '/africa_en/apps/'                      }, carePlus: { text: 'Samsung Care+', url: '/africa_en/offer/samsung-care-plus/' }, tradeIn: null },
  AFRICA_FR: { samsungHealth: { text: 'Samsung Health',              url: '/africa_fr/apps/samsung-health/'      }, appsServices: { text: 'Applis et services',           url: '/africa_fr/apps/'                      }, carePlus: { text: 'Samsung Care+', url: '/africa_fr/offer/samsung-care-plus/' }, tradeIn: null },
  AFRICA_PT: { samsungHealth: { text: 'Samsung Health',              url: '/africa_pt/apps/samsung-health/'      }, appsServices: { text: 'Apps & Serviços',              url: '/africa_pt/apps/'                      }, carePlus: { text: 'Samsung Care+', url: '/africa_pt/offer/samsung-care-plus/' }, tradeIn: null },
  ZA:        { samsungHealth: { text: 'Samsung Health',              url: '/za/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/za/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/za/offer/samsung-care-plus/'    }, tradeIn: null },

  // ── Europe ────────────────────────────────────────────────────
  UK:        { samsungHealth: { text: 'Samsung Health',              url: '/uk/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/uk/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/uk/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade In',          url: '/uk/instant-trade-in/'                } },
  IE:        { samsungHealth: { text: 'Samsung Health',              url: '/ie/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/ie/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/ie/trade-in/'                        } },
  DE:        { samsungHealth: { text: 'Samsung Health',              url: '/de/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/de/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/de/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/de/offer/trade-in/'                  } },
  AT:        { samsungHealth: { text: 'Samsung Health',              url: '/at/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/at/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/at/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/at/offer/mobile-trade-in/'            } },
  CH:        { samsungHealth: { text: 'Samsung Health',              url: '/ch/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/ch/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/ch/mobile/samsung-care-plus/'   }, tradeIn: { text: 'Samsung Trade-in',          url: '/ch/offer/trade-in/'                  } },
  CH_FR:     { samsungHealth: { text: 'Samsung Health',              url: '/ch_fr/apps/samsung-health/'          }, appsServices: { text: 'Apps & Services',              url: '/ch_fr/apps/'                          }, carePlus: { text: 'Samsung Care+', url: '/ch_fr/mobile/samsung-care-plus/' }, tradeIn: { text: 'Samsung Trade-in',         url: '/ch_fr/offer/trade-in/'               } },
  FR:        { samsungHealth: { text: 'Samsung Health',              url: '/fr/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/fr/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/fr/offer/samsung-care-plus/'    }, tradeIn: { text: 'Offres de reprise Mobiles', url: '/fr/offer/trade-in/'                  } },
  IT:        { samsungHealth: { text: 'Samsung Health',              url: '/it/apps/samsung-health/'             }, appsServices: { text: 'App e servizi',                url: '/it/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/it/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/it/offer/trade-in/'                  } },
  GR:        { samsungHealth: { text: 'Samsung Health',              url: '/gr/apps/samsung-health/'             }, appsServices: { text: 'Εφαρμογές & Υπηρεσίες',        url: '/gr/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: 'https://samsungonline-gr.foxway.tech/' } },
  ES:        { samsungHealth: { text: 'Samsung Health',              url: '/es/apps/samsung-health/'             }, appsServices: { text: 'Apps y Servicios',             url: '/es/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/es/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Entrega y Estrena', url: '/es/services/samsung-renove/'          } },
  PT:        { samsungHealth: { text: 'Samsung Health',              url: '/pt/apps/samsung-health/'             }, appsServices: { text: 'Apps e serviços',              url: '/pt/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/pt/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/pt/campanha-retomas/'                 } },
  BE:        { samsungHealth: { text: 'Samsung Health',              url: '/be/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/be/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/be/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Inruil',            url: '/be/inruil/'                          } },
  BE_FR:     { samsungHealth: { text: 'Samsung Health',              url: '/be_fr/apps/samsung-health/'          }, appsServices: { text: 'Apps & Services',              url: '/be_fr/apps/'                          }, carePlus: { text: 'Samsung Care+', url: '/be_fr/offer/samsung-care-plus/' }, tradeIn: { text: 'Samsung Reprise',           url: '/be_fr/reprise/'                      } },
  NL:        { samsungHealth: { text: 'Samsung Health',              url: '/nl/apps/samsung-health/'             }, appsServices: { text: 'Apps & Services',              url: '/nl/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/nl/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Inruil',            url: '/nl/inruil/'                          } },
  SE:        { samsungHealth: { text: 'Samsung Health',              url: '/se/apps/samsung-health/'             }, appsServices: { text: 'Appar och tjänster',           url: '/se/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/se/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/se/offer/trade-in/'                  } },
  DK:        { samsungHealth: { text: 'Samsung Health',              url: '/dk/apps/samsung-health/'             }, appsServices: { text: 'Apps og tjenester',            url: '/dk/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/dk/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/dk/offer/trade-in/'                  } },
  FI:        { samsungHealth: { text: 'Samsung Health',              url: '/fi/apps/samsung-health/'             }, appsServices: { text: 'Sovellukset ja palvelut',      url: '/fi/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/fi/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/fi/offer/trade-in/'                  } },
  NO:        { samsungHealth: { text: 'Samsung Health',              url: '/no/apps/samsung-health/'             }, appsServices: { text: 'Apper & tjenester',            url: '/no/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/no/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/no/offer/trade-in/'                  } },
  PL:        { samsungHealth: { text: 'Samsung Health',              url: '/pl/apps/samsung-health/'             }, appsServices: { text: 'Aplikacje mobilne',            url: '/pl/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/pl/offer/samsung-care-plus/'    }, tradeIn: { text: 'Program Odkup',             url: '/pl/trade-in/'                        } },
  RO:        { samsungHealth: { text: 'Samsung Health',              url: '/ro/apps/samsung-health/'             }, appsServices: { text: 'Aplicații și servicii',        url: '/ro/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/ro/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/ro/trade-in/'                        } },
  BG:        { samsungHealth: { text: 'Samsung Health',              url: '/bg/apps/samsung-health/'             }, appsServices: { text: 'Приложения и услуги',          url: '/bg/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/bg/trade-in/'                        } },
  HU:        { samsungHealth: { text: 'Samsung Health',              url: '/hu/apps/samsung-health/'             }, appsServices: { text: 'Appok és szolgáltatások',      url: '/hu/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Készülékbeszámítás',        url: '/hu/offer/mobile-trade-in/'            } },
  CZ:        { samsungHealth: { text: 'Samsung Health',              url: '/cz/apps/samsung-health/'             }, appsServices: { text: 'Aplikace a služby',            url: '/cz/apps/'                             }, carePlus: { text: 'Samsung Care+', url: '/cz/offer/samsung-care-plus/'    }, tradeIn: { text: 'Samsung Trade-in',          url: '/cz/trade-in/'                        } },
  SK:        { samsungHealth: { text: 'Samsung Health',              url: '/sk/apps/samsung-health/'             }, appsServices: { text: 'Aplikácie a služby',           url: '/sk/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/sk/trade-in/'                        } },
  EE:        { samsungHealth: { text: 'Samsung Health',              url: '/ee/apps/samsung-health/'             }, appsServices: { text: 'Rakendused ja teenused',       url: '/ee/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Tagasiost',         url: '/ee/tagasiost/'                       } },
  LV:        { samsungHealth: { text: 'Samsung Health',              url: '/lv/apps/samsung-health/'             }, appsServices: { text: 'Programmas un pakalpojumi',    url: '/lv/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Atpirkums',         url: '/lv/atpirkums/'                       } },
  LT:        { samsungHealth: { text: 'Samsung Health',              url: '/lt/apps/samsung-health/'             }, appsServices: { text: 'Programėlės ir paslaugos',     url: '/lt/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Grąžinimas',        url: '/lt/grazinimas/'                      } },
  HR:        { samsungHealth: { text: 'Samsung Health',              url: '/hr/apps/samsung-health/'             }, appsServices: { text: 'Aplikacije i usluge',          url: '/hr/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Program otkupa',            url: '/hr/trade-in/'                        } },
  RS:        { samsungHealth: { text: 'Samsung Health',              url: '/rs/apps/samsung-health/'             }, appsServices: { text: 'Mobilne aplikacije i usluge',  url: '/rs/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  SI:        { samsungHealth: { text: 'Samsung Health',              url: '/si/apps/samsung-health/'             }, appsServices: { text: 'Aplikacije in storitve',       url: '/si/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Program odkupa',            url: '/si/trade-in/'                        } },
  AL:        { samsungHealth: { text: 'Samsung Health',              url: '/al/apps/samsung-health/'             }, appsServices: { text: 'Aplikacione dhe shërbime',     url: '/al/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  MK:        { samsungHealth: { text: 'Samsung Health',              url: '/mk/apps/samsung-health/'             }, appsServices: { text: 'Апликации и услуги',           url: '/mk/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  BA:        { samsungHealth: { text: 'Samsung Health',              url: '/ba/apps/samsung-health/'             }, appsServices: { text: 'Mobilne aplikacije i usluge',  url: '/ba/apps/'                             }, carePlus: null,                                                                  tradeIn: null },
  UA:        { samsungHealth: { text: 'Samsung Health',              url: '/ua/apps/samsung-health/'             }, appsServices: { text: 'Застосунки та служби',         url: '/ua/apps/'                             }, carePlus: null,                                                                  tradeIn: { text: 'Samsung Trade-in',          url: '/ua/trade-in/'                        } },
}

// ── 서비스별 전국가 텍스트/URL 유니온 집합 (감지용 룩업) ──────
// CountryTab 모듈 로드 시 1회만 빌드됨
const _SVC_ALL_TEXTS = {}  // serviceKey → Set<string>
const _SVC_ALL_URLS  = {}  // serviceKey → string[] (길이 내림차순)

for (const { key } of SERVICE_KEYS) {
  const textSet = new Set()
  const urlSet  = new Set()
  for (const siteData of Object.values(SERVICE_DATA)) {
    const entry = siteData[key]
    if (entry) { textSet.add(entry.text); urlSet.add(entry.url) }
  }
  _SVC_ALL_TEXTS[key] = textSet
  // URL은 가장 긴 것부터 매칭 → 더 구체적인 경로가 우선 (e.g. /samsung-health/ > /apps/)
  _SVC_ALL_URLS[key]  = [...urlSet].sort((a, b) => b.length - a.length)
}

// ════════════════════════════════════════════════════════════════
// ── detectServiceIssues ───────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// 반환값: Array<{ service, type, found?, expected?, note? }>
//   type: 'not_operated' | 'wrong_text' | 'wrong_url'
//
// 동작 방식
//   1. 텍스트에서 알려진 서비스 텍스트/URL을 감지
//   2. 해당 siteCode에서 정답과 비교
//   3. 미운영 국가 언급 / 텍스트 오류 / URL 오류를 배지로 반환
// ────────────────────────────────────────────────────────────────
export function detectServiceIssues(text, siteCode) {
  if (!text?.trim() || !siteCode) return []
  const siteData = SERVICE_DATA[siteCode] ?? SERVICE_DATA[siteCode?.toUpperCase()]
  if (!siteData) return []

  const issues = []
  const lower  = text.toLowerCase()

  for (const { key, label } of SERVICE_KEYS) {
    const expected = siteData[key]   // null → 미운영

    // 1. 이 텍스트에서 서비스 관련 문자열이 감지되는가?
    const foundTexts = [..._SVC_ALL_TEXTS[key]].filter(t => lower.includes(t.toLowerCase()))
    const foundUrls  = _SVC_ALL_URLS[key].filter(u => text.includes(u))
    const isMentioned = foundTexts.length > 0 || foundUrls.length > 0
    if (!isMentioned) continue

    // 2. 미운영 국가에서 언급된 경우
    if (!expected) {
      issues.push({ service: label, type: 'not_operated', note: '미운영 국가' })
      continue
    }

    // 3. 텍스트 정답 검증 (감지는 됐는데 정답 텍스트가 없는 경우)
    const correctTextFound = lower.includes(expected.text.toLowerCase())
    if (foundTexts.length > 0 && !correctTextFound) {
      issues.push({
        service:  label,
        type:     'wrong_text',
        found:    foundTexts[0],
        expected: expected.text,
      })
    }

    // 4. URL 정답 검증 (다른 URL이 감지됐는데 정답 URL이 없는 경우)
    const correctUrlFound = text.includes(expected.url)
    if (foundUrls.length > 0 && !correctUrlFound) {
      issues.push({
        service:  label,
        type:     'wrong_url',
        found:    foundUrls[0],
        expected: expected.url,
      })
    }
  }

  return issues
}