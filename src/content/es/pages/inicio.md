---
title: "Inicio"
slug: ""
locale: "es"
order: 10
nav: false
navLabel: "Inicio"
description: "La Fundación Rosario Gatón trabaja por un mundo más justo, humano y sostenible."
legacyPath: "/inicio/"
noAutoTranslate: false
blocks:
  - type: "heroBento"
    title: "Fundación Rosario Gatón (FRG)"
    text: "Trabajamos por un mundo más justo, humano y sostenible. Nuestra misión es educar, formar y empoderar a los ciudadanos para que se conviertan en agentes de cambio, capaces de transformar su entorno familiar y comunitario mediante iniciativas productivas y sostenibles."
    backgroundImage: "pages/site/01.webp"
    backgroundImageAlt: "Fundación Rosario Gatón"
    buttons:
      - label: "Unirse"
        href: "/voluntariado/"
      - label: "Donar ahora"
        href: "/donar/"
    cards:
      - type: "solidBlue"
        title: "Áreas de Acción"
        value: "10+"
        text: "Líneas de trabajo para mejorar la vida de las comunidades."
      - type: "imageRed"
        title: "Únete al Cambio"
        text: "Hazte voluntario y participa en nuestras iniciativas."
        href: "/voluntariado/"
        image: "photos/2025-07-22-entrega-alimentos-a-familias-vulnerables-como-parte-de-su/06.webp"
        imageAlt: "Voluntarios entregando alimentos a familias"
      - type: "imageBlue"
        title: "Proyectos que Transforman"
        text: "Conoce los programas que ejecutamos en cada comunidad."
        href: "/programas-y-proyectos/"
        image: "programs/educacion-y-formacion-ciudadana/cover.webp"
        imageAlt: "Programa de educación y formación ciudadana"
      - type: "solidRed"
        title: "Nuestra Misión"
        text: "Educar, formar y empoderar para generar un cambio real."
        href: "/nosotros/"

  - type: "imageText"
    title: "¿Quiénes somos?"
    text: "La Fundación Rosario Gatón (FRG) es una organización de derechos humanos y desarrollo socioeconómico sin fines de lucro, que trabaja para tener presencia en los cinco continentes. Establecemos alianzas para disminuir la extrema pobreza, la desigualdad social y el hambre, así como prevenir la violencia de género, el terrorismo, la trata de personas y el maltrato a la fauna. Apoyamos también a los sectores más vulnerables, promoviendo inclusión, vivienda digna, microeconomía y acceso a servicios básicos."
    image: "photos/2019-01-23-se-reune-con-el-embajador-de-guatemala-para-fortalecer/01.webp"
    imageAlt: "Reunión de trabajo de la Fundación Rosario Gatón con el embajador de Guatemala en República Dominicana."
    buttons:
      - label: "Saber más"
        href: "/nosotros/"
  - type: "stats"
    items:
      - label: "Años de fundación"
        value: "20+"
      - label: "Personas impactadas"
        value: "15,000+"
      - label: "Viviendas mejoradas o construidas"
        value: "125+"
      - label: "Emprendedores capacitados"
        value: "300+"
  - type: "video"
    title: "Conoce la Fundación Rosario Gatón"
    url: "https://www.youtube.com/watch?v=xFp8-2GVoH8"
  - type: "programs"
    title: "Programas que Transforman"
    surface: false
    intro: "Conoce los programas que la Fundación Rosario Gatón ejecuta para transformar comunidades y cambiar vidas."
    programs:
      - "reduccion-de-la-pobreza-y-desigualdad-social"
      - "educacion-y-formacion-ciudadana"
      - "salud-y-seguridad-alimentaria"
      - "vivienda-digna-e-infraestructura-basica"
      - "apoyo-a-emprendimientos-y-microeconomia"
      - "inclusion-de-personas-con-discapacidad"
  - type: "latestPosts"
    title: "Últimas Noticias y Publicaciones"
    surface: true
    limit: 3
  - type: "splitCta"
    title: "Voluntariado y Donaciones"
    volunteer:
      title: "Únete como Voluntario"
      text: "Forma parte de nuestra red de colaboradores y transforma vidas junto a nosotros."
      button:
        label: "¡Únete hoy!"
        href: "/voluntariado/"
      image: "photos/2025-07-22-entrega-alimentos-a-familias-vulnerables-como-parte-de-su/06.webp"
      imageAlt: "Voluntarios"
    donate:
      title: "Haz tu Donación"
      text: "Tu apoyo es vital para seguir educando, formando y empoderando comunidades vulnerables."
      button:
        label: "Donar ahora"
        href: "/donar/"
      image: "photos/2019-01-23-se-reune-con-el-embajador-de-guatemala-para-fortalecer/01.webp"
      imageAlt: "Donaciones"
  - type: "ambassadors"
    title: "Embajadores de Buena Voluntad"
    intro: "Representamos los valores de la Fundación Rosario Gatón en los cinco continentes. Ya contamos con embajadores generales continentales y con embajadores nacionales; los demás puestos siguen abiertos a quienes quieran promover la solidaridad y la cooperación internacional desde su país."
    surface: false
    # The people come from the `team` collection (continental and country
    # ambassadors, matched by `continent`). Only the vacant countries are kept
    # here: a vacancy is a country, not a person named "to be assigned".
    continents:
      - name: "América"
        continent: "america"
        openCountries:
          - "República Dominicana"
      - name: "África"
        continent: "africa"
        openCountries:
          - "Marruecos"
          - "Sierra Leona"
      - name: "Asia"
        continent: "asia"
        openCountries:
          - "China"
      - name: "Europa"
        continent: "europa"
        openCountries:
          - "España"
          - "Francia"
          - "Portugal"
      - name: "Oceanía"
        continent: "oceania"
        openCountries:
          - "Australia"
          - "Nueva Zelanda"
          - "Fiji"
          - "Papúa Nueva Guinea"
  - type: "departments"
    title: "Nuestros Departamentos"
    intro: "Las áreas de la Fundación Rosario Gatón y las personas que las dirigen."
    surface: true
    # The people come from the `team` collection (`group: direccion`, matched by
    # `area`). Only the heading and the description of each department live here.
    areas:
      - name: "Prensa y comunicaciones"
        area: "prensa"
        description: "Da a conocer el trabajo de la Fundación a través del periodismo, la redacción, la producción audiovisual y las relaciones públicas."
      - name: "Gestión y administración"
        area: "gestion"
        description: "Se ocupa de los recursos humanos, el protocolo, los seguros y los asuntos migratorios que sostienen el funcionamiento de la Fundación."
      - name: "Asuntos Jurídicos"
        area: "juridico"
        description: "Asesora a la Fundación en materia legal y vela por el cumplimiento normativo de sus actividades a nivel internacional."
      - name: "Salud"
        area: "salud"
        description: "Impulsa la atención y la seguridad sanitaria de las comunidades que acompaña la Fundación."
      - name: "Juventud"
        area: "juventud"
        description: "Representa a la juventud de la Fundación en el mundo e impulsa su participación en nuestras iniciativas."
      - name: "Representaciones"
        area: "representaciones"
        description: "Lleva la voz de la Fundación y de sus beneficiarios ante las regiones del mundo."
  - type: "accordion"
    title: "Preguntas Frecuentes"
    surface: false
    items:
      - title: "¿Qué es la Fundación Rosario Gatón?"
        text: "<p>Es una organización sin fines de lucro que trabaja por los derechos humanos y el desarrollo socioeconómico, promoviendo iniciativas alineadas con los Objetivos de Desarrollo Sostenible (ODS) y la Estrategia Nacional de Desarrollo (END).</p>"
      - title: "¿En qué áreas trabaja la fundación?"
        text: "<p>Trabajamos en salud, educación, medioambiente, inclusión social, vivienda digna, cultura, deporte, prevención de violencia, entre otros.</p>"
      - title: "¿Cómo puedo colaborar como voluntario?"
        text: "<p>Puedes participar en actividades comunitarias, facilitar talleres, brindar apoyo administrativo o formar parte como aliado institucional. Visita nuestra sección de voluntariado y completa el formulario.</p>"
      - title: "¿Aceptan donaciones? ¿Cómo puedo donar?"
        text: "<p>Sí. Aceptamos donaciones monetarias, en especie y a través de alianzas. Puedes donar mediante transferencia bancaria o desde nuestra sección Haz tu Donación.</p>"
      - title: "¿Trabajan con otras organizaciones?"
        text: "<p>Sí, establecemos alianzas con entidades públicas, privadas y organismos internacionales para ampliar nuestro impacto social.</p>"
      - title: "¿Cómo puedo mantenerme informado de sus actividades?"
        text: "<p>Puedes seguirnos en nuestras redes sociales o visitar nuestra sección de Actualidades.</p>"
  - type: "contactSection"
    title: "Contáctanos"
    intro: "Si tienes dudas, deseas más información sobre nuestros programas, quieres colaborar con nosotros o simplemente quieres ponerte en contacto, estaremos encantados de escucharte."
    email: "info@fundacionrosariogaton.org"
    phone: "+1 (829) 649-3189"
    address: "República Dominicana"
    form: "contact"
    surface: true
---
