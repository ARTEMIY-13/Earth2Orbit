export const worlds = [
  {
    name: "Земля",
    id: "earth",
    radius: 2.15,
    stats: [
      ["СЕРЕДНЯ T", "+15 °C"],
      ["АТМОСФЕРА", "1 bar"],
      ["ГРАВІТАЦІЯ", "1.00 g"],
      ["ВОДА", "71% поверхні"],
    ],
    desc: "Наш дім — відправна точка для пошуку місць, де людство зможе жити за межами Землі.",
    places: [
      {
        id: "earth-0",
        index: 0,
        name: "Пустеля Атакама",
        type: "Марсіанський аналог",
        description:
          "Надзвичайно сухий регіон із солончаками та високою сонячною радіацією.",
        lat: -24.5,
        lon: -69.2,
        photos: [
          {
            title: "Salar de Atacama, Chile",
            url: "https://images-assets.nasa.gov/image/PIA23420/PIA23420~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA23420",
            credit:
              "NASA/METI/AIST/Japan Space Systems, and U.S./Japan ASTER Science Team",
          },
          {
            title:
              "A portion of the Atacama Desert along Peru’s southern Pacific coast",
            url: "https://images-assets.nasa.gov/image/iss074e0315662/iss074e0315662~thumb.jpg",
            source: "https://images.nasa.gov/details/iss074e0315662",
            credit: "NASA",
          },
          {
            title: "Dry Streambed on Alluvial Fan in Northern Chile",
            url: "https://images-assets.nasa.gov/image/PIA16191/PIA16191~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA16191",
            credit: "NASA/UC Berkeley",
          },
        ],
      },
      {
        id: "earth-1",
        index: 1,
        name: "Острів Девон",
        type: "Арктична пустеля",
        description:
          "Кратер Готон і холодна кам’яниста пустеля — аналог марсіанського ландшафту.",
        lat: 75.4,
        lon: -89.7,
        photos: [
          {
            title: "Mars Researchers Rendezvous on Remote Arctic Island",
            url: "https://images-assets.nasa.gov/image/PIA03714/PIA03714~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA03714",
            credit: "NASA/GSFC/LaRC/JPL, MISR Team",
          },
          {
            title: "K-10 Black crossing snow melt on Devon Island, Canada. ",
            url: "https://images-assets.nasa.gov/image/ARC-2007-ACD09-0255-002/ARC-2007-ACD09-0255-002~thumb.jpg",
            source: "https://images.nasa.gov/details/ARC-2007-ACD09-0255-002",
            credit: "NASA",
          },
          {
            title:
              "K-10 Red driving near 'The Fortress' formation at Haughton Crater, Devon Island, Canada. ",
            url: "https://images-assets.nasa.gov/image/ARC-2007-ACD09-0255-001/ARC-2007-ACD09-0255-001~thumb.jpg",
            source: "https://images.nasa.gov/details/ARC-2007-ACD09-0255-001",
            credit: "NASA",
          },
        ],
      },
      {
        id: "earth-2",
        index: 2,
        name: "Антарктичні сухі долини",
        type: "Екстремальний холод",
        description:
          "Мінімум опадів, сильні вітри й холод — природний полігон для досліджень.",
        lat: -77.5,
        lon: 161,
        photos: [
          {
            title: "Dry Valleys, Antarctica",
            url: "https://images-assets.nasa.gov/image/PIA12461/PIA12461~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12461",
            credit:
              "NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team",
          },
          {
            title:
              "Antarctic:  Dry Valleys Expedition 1996 with Chris McKay, Ames",
            url: "https://images-assets.nasa.gov/image/ARC-1996-AC96-0316-5/ARC-1996-AC96-0316-5~thumb.jpg",
            source: "https://images.nasa.gov/details/ARC-1996-AC96-0316-5",
            credit: "NASA",
          },
          {
            title:
              "Antarctic:  Dry Valleys Expedition 1996 with Chris McKay, Ames",
            url: "https://images-assets.nasa.gov/image/ARC-1996-AC96-0316-4/ARC-1996-AC96-0316-4~thumb.jpg",
            source: "https://images.nasa.gov/details/ARC-1996-AC96-0316-4",
            credit: "NASA",
          },
        ],
      },
      {
        id: "earth-3",
        index: 3,
        name: "Гавайські лавові поля",
        type: "Вулканічна геологія",
        description:
          "Базальтові потоки та лавові тунелі допомагають вивчати місячну геологію.",
        lat: 19.4,
        lon: -155.3,
        photos: [
          {
            title: "New Image of Kilauea's Lava Flows taken by NASA Spacecraft",
            url: "https://images-assets.nasa.gov/image/PIA22459/PIA22459~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA22459",
            credit:
              "NASA/METI/AIST/Japan Space Systems, and U.S./Japan ASTER Science Team",
          },
          {
            title: "2018 Kilauea East Rift Zone Eruption",
            url: "https://images-assets.nasa.gov/image/PIA22899/PIA22899~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA22899",
            credit:
              "NASA/METI/AIST/Japan Space Systems, and U.S./Japan ASTER Science Team",
          },
          {
            title: "Satellite View of Kilauea Eruption",
            url: "https://images-assets.nasa.gov/image/PIA22450/PIA22450~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA22450",
            credit:
              "NASA/METI/AIST/Japan Space Systems, and U.S./Japan ASTER Science Team",
          },
        ],
      },
      {
        id: "earth-4",
        index: 4,
        name: "Пустеля Мохаве",
        type: "Сухий кам’янистий рельєф",
        description: "Пил, спека та скелясті ландшафти для тестування техніки.",
        lat: 35,
        lon: -116,
        photos: [
          {
            title: "Mojave Desert, California",
            url: "https://images-assets.nasa.gov/image/SL2-03-126/SL2-03-126~thumb.jpg",
            source: "https://images.nasa.gov/details/SL2-03-126",
            credit: "NASA",
          },
          {
            title: "Space Radar Image of Barstow, California",
            url: "https://images-assets.nasa.gov/image/PIA01851/PIA01851~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA01851",
            credit: "NASA/JPL",
          },
          {
            url: "/assets/locations/earth-4-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA Blue Marble",
            source: "https://www.solarsystemscope.com/textures/",
          },
        ],
      },
      {
        id: "earth-5",
        index: 5,
        name: "Ісландське нагір’я",
        type: "Базальт і холод",
        description: "Вулканічні породи, льодовики та суворий клімат.",
        lat: 64.8,
        lon: -18.7,
        photos: [
          {
            title: "Iceland",
            url: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000775/GSFC_20171208_Archive_e000775~thumb.jpg",
            source:
              "https://images.nasa.gov/details/GSFC_20171208_Archive_e000775",
            credit: "NASA",
          },
          {
            title: "Cloud-Free View of Iceland",
            url: "https://images-assets.nasa.gov/image/cloud-free-view-of-iceland_17168825861_o/cloud-free-view-of-iceland_17168825861_o~thumb.jpg",
            source:
              "https://images.nasa.gov/details/cloud-free-view-of-iceland_17168825861_o",
            credit: "NASA",
          },
          {
            title: "Artemis geology training in Iceland -- jsc2026e405547",
            url: "https://images-assets.nasa.gov/image/jsc2026e405547/jsc2026e405547~thumb.jpg",
            source: "https://images.nasa.gov/details/jsc2026e405547",
            credit: "James Blair - NASA - JSC",
          },
        ],
      },
      {
        id: "earth-6",
        index: 6,
        name: "Пустеля Наміб",
        type: "Сухі дюни",
        description:
          "Дюни, сухість і піщані відкладення для тестування роботів.",
        lat: -24.7,
        lon: 15.3,
        photos: [
          {
            title: "Space Radar Image of Namib Desert in Southern Namib",
            url: "https://images-assets.nasa.gov/image/PIA01720/PIA01720~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA01720",
            credit: "NASA/JPL-Caltech",
          },
          {
            title: "Namib Desert, Namibia",
            url: "https://images-assets.nasa.gov/image/PIA17632/PIA17632~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA17632",
            credit:
              "NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team",
          },
          {
            title: "Namib Desert, Namibia, Africa",
            url: "https://images-assets.nasa.gov/image/sts031-151-164/sts031-151-164~thumb.jpg",
            source: "https://images.nasa.gov/details/sts031-151-164",
            credit: "NASA",
          },
        ],
      },
      {
        id: "earth-7",
        index: 7,
        name: "Вулкан Тейде",
        type: "Вулканічний аналог",
        description: "Вулканічні породи та високогірні умови.",
        lat: 28.27,
        lon: -16.64,
        photos: [
          {
            title: "Space Radar Image of Teide Volcano",
            url: "https://images-assets.nasa.gov/image/PIA01779/PIA01779~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA01779",
            credit: "NASA/JPL",
          },
          {
            title: "Earth Observation taken by the Expedition 20 crew",
            url: "https://images-assets.nasa.gov/image/iss020e021140/iss020e021140~thumb.jpg",
            source: "https://images.nasa.gov/details/iss020e021140",
            credit: "Koichi Wakata",
          },
          {
            title: "Earth Observations taken by the Expedition 13 crew",
            url: "https://images-assets.nasa.gov/image/iss013e23272/iss013e23272~thumb.jpg",
            source: "https://images.nasa.gov/details/iss013e23272",
            credit: "NASA",
          },
        ],
      },
      {
        id: "earth-8",
        index: 8,
        name: "Пустеля Ваді-Рам",
        type: "Марсіанські скелі",
        description: "Червоні пісковики й сухий кам’янистий ландшафт.",
        lat: 29.58,
        lon: 35.42,
        photos: [
          {
            title: "Wadi Rum, Jordan",
            url: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001903/GSFC_20171208_Archive_e001903~thumb.jpg",
            source:
              "https://images.nasa.gov/details/GSFC_20171208_Archive_e001903",
            credit: "NASA",
          },
          {
            url: "/assets/locations/earth-8-1.jpg",
            title: "Положення локації на фотокарті поверхні · поле 50°",
            credit: "NASA Blue Marble",
            source: "https://www.solarsystemscope.com/textures/",
          },
          {
            url: "/assets/locations/earth-8-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA Blue Marble",
            source: "https://www.solarsystemscope.com/textures/",
          },
        ],
      },
      {
        id: "earth-9",
        index: 9,
        name: "Салар-де-Уюні",
        type: "Солончаки",
        description: "Соляні рівнини та екстремальні умови високогір’я.",
        lat: -20.13,
        lon: -67.49,
        photos: [
          {
            title: "A lithium extraction facility in Bolivia's Salar de Uyuni",
            url: "https://images-assets.nasa.gov/image/iss074e0796207/iss074e0796207~thumb.jpg",
            source: "https://images.nasa.gov/details/iss074e0796207",
            credit: "NASA",
          },
          {
            title:
              "The Salar de Uyuni in Bolivia is the world's largest salt flat",
            url: "https://images-assets.nasa.gov/image/iss074e0319935/iss074e0319935~thumb.jpg",
            source: "https://images.nasa.gov/details/iss074e0319935",
            credit: "NASA",
          },
          {
            title: "Earth observation taken by the Expedition 33 crew.",
            url: "https://images-assets.nasa.gov/image/iss033e006202/iss033e006202~thumb.jpg",
            source: "https://images.nasa.gov/details/iss033e006202",
            credit: "NASA",
          },
        ],
      },
      {
        id: "earth-10",
        index: 10,
        name: "Лансароте",
        type: "Лавові поля",
        description: "Молоді лавові потоки для геологічних тренувань.",
        lat: 29.05,
        lon: -13.63,
        photos: [
          {
            title: "Lanzarote, Spanish Canary Islands",
            url: "https://images-assets.nasa.gov/image/PIA23526/PIA23526~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA23526",
            credit:
              "NASA/METI/AIST/Japan Space Systems, and U.S./Japan ASTER Science Team",
          },
          {
            title: "Lanzarote, Canary Islands",
            url: "https://images-assets.nasa.gov/image/PIA21284/PIA21284~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA21284",
            credit:
              "NASA/METI/AIST/Japan Space Systems, and U.S./Japan ASTER Science Team",
          },
          {
            url: "/assets/locations/earth-10-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA Blue Marble",
            source: "https://www.solarsystemscope.com/textures/",
          },
        ],
      },
      {
        id: "earth-11",
        index: 11,
        name: "Пустеля Гобі",
        type: "Континентальна пустеля",
        description: "Температурні перепади та віддаленість.",
        lat: 43.4,
        lon: 104.3,
        photos: [
          {
            title: "Gobi Desert, China as seen from STS-59",
            url: "https://images-assets.nasa.gov/image/sts059-220-041/sts059-220-041~thumb.jpg",
            source: "https://images.nasa.gov/details/sts059-220-041",
            credit: "NASA",
          },
          {
            title: "Earth observation taken by the Expedition 28 crew",
            url: "https://images-assets.nasa.gov/image/iss028e044444/iss028e044444~thumb.jpg",
            source: "https://images.nasa.gov/details/iss028e044444",
            credit: "Mike Fossum",
          },
          {
            url: "/assets/locations/earth-11-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA Blue Marble",
            source: "https://www.solarsystemscope.com/textures/",
          },
        ],
      },
      {
        id: "earth-12",
        index: 12,
        name: "Пустеля Аравійська",
        type: "Спека і пил",
        description: "Пилові середовища й ізольовані експедиції.",
        lat: 23.5,
        lon: 45,
        photos: [
          {
            title: "Rub al Khali, Arabia",
            url: "https://images-assets.nasa.gov/image/PIA11084/PIA11084~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA11084",
            credit:
              "NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team",
          },
          {
            title: "Wadi Al Dawasir, Saudi Arabia",
            url: "https://images-assets.nasa.gov/image/PIA20077/PIA20077~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA20077",
            credit:
              "NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team",
          },
          {
            url: "/assets/locations/earth-12-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA Blue Marble",
            source: "https://www.solarsystemscope.com/textures/",
          },
        ],
      },
    ],
  },
  {
    name: "Місяць",
    id: "moon",
    radius: 0.57,
    stats: [
      ["СЕРЕДНЯ T", "−53 °C"],
      ["АТМОСФЕРА", "майже вакуум"],
      ["ГРАВІТАЦІЯ", "0.166 g"],
      ["ВОДА", "лід у кратерах"],
    ],
    desc: "Найближчий світ для постійної присутності людини. Полярний лід може стати ресурсом майбутніх баз.",
    places: [
      {
        id: "moon-0",
        index: 0,
        name: "Кратер Шеклтон",
        type: "Південний полюс",
        description: "Постійно затінені ділянки можуть містити водяний лід.",
        lat: -89.9,
        lon: 0,
        photos: [
          {
            url: "https://science.nasa.gov/wp-content/uploads/2024/01/faces-of-shackleton.jpg",
            title: "Кратер Шеклтон · знімки та рельєф",
            credit: "NASA / GSFC / LROC",
            source:
              "https://science.nasa.gov/image-detail/faces-of-shackleton/",
          },
          {
            url: "https://www.nasa.gov/wp-content/uploads/2023/04/shackleton_arrow.png",
            title: "Кратер Шеклтон · знімки та рельєф",
            credit: "NASA / GSFC / LROC",
            source:
              "https://www.nasa.gov/solar-system/nasas-shadowcam-images-lunar-south-pole-region/",
          },
          {
            url: "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/l/lunar_south_pole_lroc_med.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg",
            title: "Кратер Шеклтон · знімки та рельєф",
            credit: "NASA / GSFC / LROC",
            source:
              "https://science.nasa.gov/resource/illumination-map-of-the-moons-south-pole/",
          },
        ],
      },
      {
        id: "moon-1",
        index: 1,
        name: "Море Спокою",
        type: "Рівнинний регіон",
        description: "Базальтова рівнина місця посадки Apollo 11.",
        lat: 8.5,
        lon: 31.4,
        photos: [
          {
            title:
              "Apollo 11 stereo view showing stone embedded in powdery lunar surface",
            url: "https://images-assets.nasa.gov/image/as11-45-6712/as11-45-6712~thumb.jpg",
            source: "https://images.nasa.gov/details/as11-45-6712",
            credit: "NASA",
          },
          {
            title:
              "Apollo 11 stereo view showing lump of surface powder with colored material",
            url: "https://images-assets.nasa.gov/image/as11-45-6709/as11-45-6709~thumb.jpg",
            source: "https://images.nasa.gov/details/as11-45-6709",
            credit: "NASA",
          },
          {
            title:
              "View of footpad of Apollo 11 Lunar Module as it rested on lunar surface",
            url: "https://images-assets.nasa.gov/image/as11-40-5917/as11-40-5917~thumb.jpg",
            source: "https://images.nasa.gov/details/as11-40-5917",
            credit: "NASA",
          },
        ],
      },
      {
        id: "moon-2",
        index: 2,
        name: "Кратер Кабеус",
        type: "Полярні ресурси",
        description:
          "Спостереження місії LCROSS вказали на воду та леткі речовини.",
        lat: -84.9,
        lon: -35.5,
        photos: [
          {
            url: "https://science.nasa.gov/wp-content/uploads/2024/01/20110615lcross.jpg",
            title: "Кратер Кабеус · район удару LCROSS",
            credit: "NASA / GSFC / LROC",
            source: "https://science.nasa.gov/image-detail/20110615lcross/",
          },
          {
            url: "/assets/locations/moon-2-1.jpg",
            title: "Положення локації на фотокарті поверхні · поле 50°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
          {
            url: "/assets/locations/moon-2-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
        ],
      },
      {
        id: "moon-3",
        index: 3,
        name: "Плато Арістарх",
        type: "Вулканічна геологія",
        description: "Один із найцікавіших геологічних районів Місяця.",
        lat: 26.1,
        lon: -47.4,
        photos: [
          {
            title: "Striated Blocks in Aristarchus Crater",
            url: "https://images-assets.nasa.gov/image/PIA14009/PIA14009~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA14009",
            credit: "NASA/GSFC/Arizona State University",
          },
          {
            title: "Aristarchus Plateau 2: Pyroclastic Deposit",
            url: "https://images-assets.nasa.gov/image/PIA12944/PIA12944~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12944",
            credit: "NASA/GSFC/Arizona State University",
          },
          {
            title: "Multispectral Mosaic of the Aristarchus Crater and Plateau",
            url: "https://images-assets.nasa.gov/image/PIA00090/PIA00090~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA00090",
            credit: "NASA/JPL/USGS",
          },
        ],
      },
      {
        id: "moon-4",
        index: 4,
        name: "Пік Малаперт",
        type: "Полярна височина",
        description:
          "Південнополярна височина, потенційно корисна для зв’язку.",
        lat: -85.9,
        lon: 0,
        photos: [
          {
            title: "Near the Summit of Malapert Mountain",
            url: "https://images-assets.nasa.gov/image/PIA12953/PIA12953~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12953",
            credit: "NASA/GSFC/Arizona State University",
          },
          {
            url: "/assets/locations/moon-4-1.jpg",
            title: "Положення локації на фотокарті поверхні · поле 50°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
          {
            url: "/assets/locations/moon-4-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
        ],
      },
      {
        id: "moon-5",
        index: 5,
        name: "Басейн Південний полюс — Ейткен",
        type: "Ударний басейн",
        description: "Давній гігантський ударний басейн.",
        lat: -53,
        lon: 169,
        photos: [
          {
            title: "Ready for a Close Up",
            url: "https://images-assets.nasa.gov/image/art002e009283/art002e009283~thumb.jpg",
            source: "https://images.nasa.gov/details/art002e009283",
            credit: "NASA",
          },
          {
            title:
              "Farside View of Earth Moon as Seen by the Clementine Spacecraft",
            url: "https://images-assets.nasa.gov/image/PIA00304/PIA00304~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA00304",
            credit: "NASA/JPL/USGS",
          },
          {
            url: "/assets/locations/moon-5-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
        ],
      },
      {
        id: "moon-6",
        index: 6,
        name: "Море Дощів",
        type: "Базальтові рівнини",
        description: "Велика рівнина з базальтовими породами.",
        lat: 32.8,
        lon: -15.6,
        photos: [
          {
            title: "Wrinkle Ridges of Northwest Mare Imbrium",
            url: "https://images-assets.nasa.gov/image/PIA12931/PIA12931~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12931",
            credit: "NASA/GSFC/Arizona State University",
          },
          {
            title: "Milichius A",
            url: "https://images-assets.nasa.gov/image/PIA12906/PIA12906~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12906",
            credit: "NASA/GSFC/Arizona State University",
          },
          {
            title: "Wrinkle Ridge Near Montes Teneriffe",
            url: "https://images-assets.nasa.gov/image/PIA12938/PIA12938~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12938",
            credit: "NASA/GSFC/Arizona State University",
          },
        ],
      },
      {
        id: "moon-7",
        index: 7,
        name: "Кратер Пірі",
        type: "Північний полюс",
        description: "Полярний регіон для вивчення освітлення та тіней.",
        lat: 88.6,
        lon: 33,
        photos: [
          {
            title: "Peary Crater: Greetings from the North Pole of the Moon",
            url: "https://images-assets.nasa.gov/image/PIA12937/PIA12937~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA12937",
            credit: "NASA/GSFC/Arizona State University",
          },
          {
            url: "/assets/locations/moon-7-1.jpg",
            title: "Положення локації на фотокарті поверхні · поле 50°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
          {
            url: "/assets/locations/moon-7-2.jpg",
            title: "Положення локації на фотокарті поверхні · поле 20°",
            credit: "NASA / LROC",
            source: "https://svs.gsfc.nasa.gov/4720/",
          },
        ],
      },
    ],
  },
  {
    name: "Марс",
    id: "mars",
    radius: 1.48,
    stats: [
      ["СЕРЕДНЯ T", "−63 °C"],
      ["АТМОСФЕРА", "6 mbar"],
      ["ГРАВІТАЦІЯ", "0.38 g"],
      ["ВОДА", "лід під ґрунтом"],
    ],
    desc: "Холодна пустельна планета з тонкою атмосферою. Майбутнім базам знадобляться захист і місцеві ресурси.",
    places: [
      {
        id: "mars-0",
        index: 0,
        name: "Кратер Єзеро",
        type: "Стародавнє озеро",
        description:
          "Дельта річки та осадові породи — ціль пошуку слідів давнього життя.",
        lat: 18.4,
        lon: 77.6,
        photos: [
          {
            title: "Jezero Crater Delta",
            url: "https://images-assets.nasa.gov/image/PIA26252/PIA26252~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA26252",
            credit: "NASA/JPL-Caltech/ASU",
          },
          {
            title: "Jezero Crater",
            url: "https://images-assets.nasa.gov/image/PIA25350/PIA25350~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA25350",
            credit: "NASA/JPL-Caltech/ASU",
          },
          {
            title: "Jezero Crater Rim",
            url: "https://images-assets.nasa.gov/image/PIA25903/PIA25903~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA25903",
            credit: "NASA/JPL-Caltech/ASU",
          },
        ],
      },
      {
        id: "mars-1",
        index: 1,
        name: "Олімп",
        type: "Вулканічний регіон",
        description: "Найвищий вулкан Сонячної системи.",
        lat: 18.65,
        lon: -133.8,
        photos: [
          {
            title: "Olympus Mons",
            url: "https://images-assets.nasa.gov/image/PIA10063/PIA10063~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA10063",
            credit: "NASA/JPL/ASU",
          },
          {
            title: "Olympus Mons",
            url: "https://images-assets.nasa.gov/image/PIA10020/PIA10020~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA10020",
            credit: "NASA/JPL/ASU",
          },
          {
            title: "Olympus Mons",
            url: "https://images-assets.nasa.gov/image/PIA10871/PIA10871~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA10871",
            credit: "NASA/JPL/ASU",
          },
        ],
      },
      {
        id: "mars-2",
        index: 2,
        name: "Долина Марінера",
        type: "Гігантський каньйон",
        description: "Величезна система каньйонів із різноманітною геологією.",
        lat: -13.9,
        lon: -59.2,
        photos: [
          {
            title: "Valles Marineris",
            url: "https://images-assets.nasa.gov/image/PIA00992/PIA00992~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA00992",
            credit: "NASA/JPL/Malin Space Science Systems",
          },
          {
            title: "Valles Marineris Wall Rock",
            url: "https://images-assets.nasa.gov/image/PIA09391/PIA09391~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA09391",
            credit: "NASA/JPL/Univ. of Arizona",
          },
          {
            title: "Valles Marineris Mosaic",
            url: "https://images-assets.nasa.gov/image/PIA06926/PIA06926~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA06926",
            credit: "NASA/JPL/Arizona State University",
          },
        ],
      },
      {
        id: "mars-3",
        index: 3,
        name: "Рівнина Аркадія",
        type: "Північні рівнини",
        description: "Можливі поклади підповерхневого водяного льоду.",
        lat: 46.7,
        lon: -160,
        photos: [
          {
            title: "Arcadia Planitia",
            url: "https://images-assets.nasa.gov/image/PIA04059/PIA04059~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA04059",
            credit: "NASA/JPL/Arizona State University",
          },
          {
            title: "Arcadia Planitia - False Color",
            url: "https://images-assets.nasa.gov/image/PIA22791/PIA22791~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA22791",
            credit: "NASA/JPL-Caltech/ASU",
          },
          {
            title: "Arcadia Planitia Hills",
            url: "https://images-assets.nasa.gov/image/PIA22377/PIA22377~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA22377",
            credit: "NASA/JPL-Caltech/ASU",
          },
        ],
      },
      {
        id: "mars-4",
        index: 4,
        name: "Утопія Планітія",
        type: "Низовина",
        description:
          "Велика рівнина з можливими запасами підповерхневого льоду.",
        lat: 46.7,
        lon: 118,
        photos: [
          {
            title: "Martian Sunrise at Utopia Planitia",
            url: "https://images-assets.nasa.gov/image/PIA00576/PIA00576~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA00576",
            credit: "NASA/JPL",
          },
          {
            title: "Frost on Utopia Planitia",
            url: "https://images-assets.nasa.gov/image/PIA00530/PIA00530~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA00530",
            credit: "NASA/JPL",
          },
          {
            title: "Utopia Planitia",
            url: "https://images-assets.nasa.gov/image/PIA08728/PIA08728~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA08728",
            credit: "NASA/JPL/ASU",
          },
        ],
      },
      {
        id: "mars-5",
        index: 5,
        name: "Елізіум Планітія",
        type: "Рівнина",
        description: "Місце посадки InSight і сейсмічних досліджень.",
        lat: 4.5,
        lon: 135.9,
        photos: [
          {
            title: "Elysium Planitia",
            url: "https://images-assets.nasa.gov/image/PIA06824/PIA06824~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA06824",
            credit: "NASA/JPL/Arizona State University",
          },
          {
            title: "Elysium Planitia",
            url: "https://images-assets.nasa.gov/image/PIA10332/PIA10332~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA10332",
            credit: "NASA/JPL/ASU",
          },
          {
            title: "Crater in Elysium Planitia",
            url: "https://images-assets.nasa.gov/image/PIA05642/PIA05642~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA05642",
            credit: "NASA/JPL/Malin Space Science Systems",
          },
        ],
      },
      {
        id: "mars-6",
        index: 6,
        name: "Кратер Гейл",
        type: "Осадова геологія",
        description: "Місце досліджень ровера Curiosity.",
        lat: -5.4,
        lon: 137.8,
        photos: [
          {
            title: "Gale Crater - False Color",
            url: "https://images-assets.nasa.gov/image/PIA21196/PIA21196~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA21196",
            credit: "NASA/JPL-Caltech/ASU",
          },
          {
            title: "Gale Crater - False Color",
            url: "https://images-assets.nasa.gov/image/PIA21530/PIA21530~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA21530",
            credit: "NASA/JPL-Caltech/ASU",
          },
          {
            title: "Gale Crater - False Color",
            url: "https://images-assets.nasa.gov/image/PIA21529/PIA21529~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA21529",
            credit: "NASA/JPL-Caltech/ASU",
          },
        ],
      },
      {
        id: "mars-7",
        index: 7,
        name: "Плато Меридіана",
        type: "Гематит",
        description: "Регіон мінералів, пов’язаних із водним минулим.",
        lat: 0.2,
        lon: -2,
        photos: [
          {
            title: "Meridiani Planum",
            url: "https://images-assets.nasa.gov/image/PIA04275/PIA04275~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA04275",
            credit: "NASA/JPL",
          },
          {
            title: "Meridiani Planum",
            url: "https://images-assets.nasa.gov/image/PIA04800/PIA04800~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA04800",
            credit: "NASA/JPL/Arizona State University",
          },
          {
            title: "Meridiani Planum",
            url: "https://images-assets.nasa.gov/image/PIA05355/PIA05355~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA05355",
            credit: "NASA/JPL/Arizona State University",
          },
        ],
      },
      {
        id: "mars-8",
        index: 8,
        name: "Рівнина Ісіда",
        type: "Ударний басейн",
        description: "Низинний ударний регіон.",
        lat: 12.9,
        lon: 87,
        photos: [
          {
            title: "Isidis Planitia",
            url: "https://images-assets.nasa.gov/image/PIA04838/PIA04838~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA04838",
            credit: "NASA/JPL/Malin Space Science Systems",
          },
          {
            title: "Isidis Planitia",
            url: "https://images-assets.nasa.gov/image/PIA04538/PIA04538~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA04538",
            credit: "NASA/JPL/Arizona State University",
          },
          {
            title: "Isidis Planitia",
            url: "https://images-assets.nasa.gov/image/PIA05019/PIA05019~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA05019",
            credit: "NASA/JPL/Malin Space Science Systems",
          },
        ],
      },
      {
        id: "mars-9",
        index: 9,
        name: "Дейтеронілус Менсе",
        type: "Лід і рельєф",
        description: "Складний рельєф з ознаками льодовикових процесів.",
        lat: 44,
        lon: 25,
        photos: [
          {
            title: "Deuteronilus Mensae",
            url: "https://images-assets.nasa.gov/image/PIA07954/PIA07954~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA07954",
            credit: "NASA/JPL/Arizona State University",
          },
          {
            title: "Lobate Apron in Deuteronilus Mensae",
            url: "https://images-assets.nasa.gov/image/PIA09516/PIA09516~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA09516",
            credit: "NASA/JPL/Univ. of Arizona",
          },
          {
            title: "Deuteronilus Mensae",
            url: "https://images-assets.nasa.gov/image/PIA03844/PIA03844~thumb.jpg",
            source: "https://images.nasa.gov/details/PIA03844",
            credit: "NASA/JPL/Arizona State University",
          },
        ],
      },
    ],
  },
  {
    name: "Сонце",
    id: "sun",
    radius: 2.9,
    stats: [
      ["ФОТОСФЕРА", "≈ 5 500 °C"],
      ["ДІАМЕТР", "≈ 1,4 млн км"],
      ["ВІК", "≈ 4,6 млрд р."],
      ["ТИП", "Зірка G2 V"],
    ],
    desc: "Зірка в центрі нашої системи. Її світло й тепло формують умови на планетах і підтримують життя на Землі.",
    places: [],
  },
];
