// Mock author data for Stage 4 — replaced in Stage 5 by live Supabase reads.
// Shape mirrors the eventual API response from `getAuthorsByCountry()`.
// Chosen to demonstrate all three map tints: read-only, mixed, discovery-only.

import type { MockCountryEntry } from "../lib/map-state";

export const mockCountries: MockCountryEntry[] = [
  // --- mixed -----------------------------------------------------------------
  {
    iso_a3: "ESP",
    authors: [
      {
        id: "mock-esp-1",
        name: "Almudena Grandes",
        status: "read",
        birth_year: 1960,
        death_year: 2021,
        books: [
          { title: "Las edades de Lulú", year: 1989 },
          { title: "El corazón helado", year: 2007 },
        ],
      },
      {
        id: "mock-esp-2",
        name: "Najat El Hachmi",
        status: "discovery",
        birth_year: 1979,
        books: [
          { title: "L'últim patriarca", year: 2008 },
          { title: "El lunes nos querrán", year: 2021 },
        ],
      },
    ],
  },
  {
    iso_a3: "ARG",
    authors: [
      {
        id: "mock-arg-1",
        name: "Silvina Ocampo",
        status: "read",
        birth_year: 1903,
        death_year: 1993,
        books: [{ title: "La furia y otros cuentos", year: 1959 }],
      },
      {
        id: "mock-arg-2",
        name: "Mariana Enríquez",
        status: "read",
        birth_year: 1973,
        books: [{ title: "Los peligros de fumar en la cama", year: 2009 }],
      },
      {
        id: "mock-arg-3",
        name: "Samanta Schweblin",
        status: "discovery",
        birth_year: 1978,
        books: [{ title: "Distancia de rescate", year: 2014 }],
      },
    ],
  },
  {
    iso_a3: "MEX",
    authors: [
      {
        id: "mock-mex-1",
        name: "Elena Garro",
        status: "read",
        birth_year: 1916,
        death_year: 1998,
        books: [{ title: "Los recuerdos del porvenir", year: 1963 }],
      },
      {
        id: "mock-mex-2",
        name: "Fernanda Melchor",
        status: "discovery",
        birth_year: 1982,
        books: [{ title: "Temporada de huracanes", year: 2017 }],
      },
    ],
  },
  {
    iso_a3: "JPN",
    authors: [
      {
        id: "mock-jpn-1",
        name: "Yoko Tawada",
        status: "read",
        birth_year: 1960,
        books: [{ title: "El emisario", year: 2014 }],
      },
      {
        id: "mock-jpn-2",
        name: "Sayaka Murata",
        status: "discovery",
        birth_year: 1979,
        books: [{ title: "La dependienta", year: 2016 }],
      },
      {
        id: "mock-jpn-3",
        name: "Mieko Kawakami",
        status: "discovery",
        birth_year: 1976,
        books: [{ title: "Pechos y huevos", year: 2008 }],
      },
    ],
  },
  {
    iso_a3: "NGA",
    authors: [
      {
        id: "mock-nga-1",
        name: "Chimamanda Ngozi Adichie",
        status: "read",
        birth_year: 1977,
        books: [
          { title: "Medio sol amarillo", year: 2006 },
          { title: "Americanah", year: 2013 },
        ],
      },
      {
        id: "mock-nga-2",
        name: "Buchi Emecheta",
        status: "discovery",
        birth_year: 1944,
        death_year: 2017,
        books: [{ title: "Las delicias de la maternidad", year: 1979 }],
      },
    ],
  },
  {
    iso_a3: "KOR",
    authors: [
      {
        id: "mock-kor-1",
        name: "Han Kang",
        status: "read",
        birth_year: 1970,
        books: [{ title: "La vegetariana", year: 2007 }],
      },
      {
        id: "mock-kor-2",
        name: "Bora Chung",
        status: "discovery",
        birth_year: 1976,
        books: [{ title: "Conejo maldito", year: 2017 }],
      },
    ],
  },
  {
    iso_a3: "DEU",
    authors: [
      {
        id: "mock-deu-1",
        name: "Jenny Erpenbeck",
        status: "read",
        birth_year: 1967,
        books: [{ title: "Kairós", year: 2021 }],
      },
      {
        id: "mock-deu-2",
        name: "Olga Grjasnowa",
        status: "discovery",
        birth_year: 1984,
        books: [{ title: "El ruso es el idioma que ama", year: 2012 }],
      },
    ],
  },
  {
    iso_a3: "CAN",
    authors: [
      {
        id: "mock-can-1",
        name: "Margaret Atwood",
        status: "read",
        birth_year: 1939,
        books: [
          { title: "El cuento de la criada", year: 1985 },
          { title: "Alias Grace", year: 1996 },
        ],
      },
      {
        id: "mock-can-2",
        name: "Esi Edugyan",
        status: "discovery",
        birth_year: 1978,
        books: [{ title: "Washington Black", year: 2018 }],
      },
    ],
  },
  {
    iso_a3: "USA",
    authors: [
      {
        id: "mock-usa-1",
        name: "Toni Morrison",
        status: "read",
        birth_year: 1931,
        death_year: 2019,
        books: [
          { title: "Beloved", year: 1987 },
          { title: "Ojos azules", year: 1970 },
        ],
      },
      {
        id: "mock-usa-2",
        name: "Lauren Groff",
        status: "discovery",
        birth_year: 1978,
        books: [{ title: "Matrix", year: 2021 }],
      },
    ],
  },
  {
    iso_a3: "IND",
    authors: [
      {
        id: "mock-ind-1",
        name: "Arundhati Roy",
        status: "read",
        birth_year: 1961,
        books: [{ title: "El dios de las pequeñas cosas", year: 1997 }],
      },
      {
        id: "mock-ind-2",
        name: "Geetanjali Shree",
        status: "discovery",
        birth_year: 1957,
        books: [{ title: "Tumba de arena", year: 2018 }],
      },
    ],
  },

  // --- read-only -------------------------------------------------------------
  {
    iso_a3: "FRA",
    authors: [
      {
        id: "mock-fra-1",
        name: "Annie Ernaux",
        status: "read",
        birth_year: 1940,
        books: [
          { title: "El lugar", year: 1983 },
          { title: "Los años", year: 2008 },
          { title: "Memoria de chica", year: 2016 },
        ],
      },
    ],
  },
  {
    iso_a3: "ZAF",
    authors: [
      {
        id: "mock-zaf-1",
        name: "Nadine Gordimer",
        status: "read",
        birth_year: 1923,
        death_year: 2014,
        books: [{ title: "La hija de Burger", year: 1979 }],
      },
    ],
  },

  // --- discovery-only --------------------------------------------------------
  {
    iso_a3: "KEN",
    authors: [
      {
        id: "mock-ken-1",
        name: "Yvonne Adhiambo Owuor",
        status: "discovery",
        birth_year: 1968,
        books: [{ title: "Polvo", year: 2014 }],
      },
    ],
  },
  {
    iso_a3: "BRA",
    authors: [
      {
        id: "mock-bra-1",
        name: "Clarice Lispector",
        status: "discovery",
        birth_year: 1920,
        death_year: 1977,
        books: [{ title: "La hora de la estrella", year: 1977 }],
      },
    ],
  },
  {
    iso_a3: "ITA",
    authors: [
      {
        id: "mock-ita-1",
        name: "Elena Ferrante",
        status: "discovery",
        books: [{ title: "La amiga estupenda", year: 2011 }],
      },
    ],
  },
];
