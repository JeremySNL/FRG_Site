---
title: "ホーム"
slug: ""
locale: "ja"
order: 10
nav: false
navLabel: "ホーム"
description: "Fundación Rosario Gatónは、より公正で、人間味があり、持続可能な世界の実現に向けて取り組んでいます。"
legacyPath: "/inicio/"
noAutoTranslate: false
blocks:
  - type: "heroBento"
    title: "Fundación Rosario Gatón (FRG)"
    text: "私たちは、より公正で、人間味があり、持続可能な世界の実現を目指しています。私たちの使命は、市民が変革の担い手となるよう教育、育成、エンパワーメントを行い、生産的かつ持続可能なイニシアチブを通じて家庭や地域社会の環境を変革できるようにすることです。"
    backgroundImage: "pages/site/01.webp"
    backgroundImageAlt: "Fundación Rosario Gatón"
    buttons:
      - label: "参加する"
        href: "/ja/voluntariado/"
      - label: "今すぐ寄付する"
        href: "/ja/donar/"
    cards:
      - type: "solidBlue"
        title: "活動分野"
        value: "10+"
        text: "コミュニティの生活を向上させるための活動分野。"
      - type: "imageRed"
        title: "変革に参加する"
        text: "ボランティアとして参加し、私たちの取り組みに加わってください。"
        href: "/ja/voluntariado/"
        image: "photos/2025-07-22-entrega-alimentos-a-familias-vulnerables-como-parte-de-su/06.webp"
        imageAlt: "家族に食料を届けるボランティア"
      - type: "imageBlue"
        title: "社会を変えるプロジェクト"
        text: "各コミュニティで実施しているプログラムをご覧ください。"
        href: "/ja/programas-y-proyectos/"
        image: "programs/educacion-y-formacion-ciudadana/cover.webp"
        imageAlt: "教育および市民教育プログラム"
      - type: "solidRed"
        title: "私たちの使命"
        text: "教育し、育成し、力を与えることで、真の変化を生み出す。"
        href: "/ja/nosotros/"
  - type: "imageText"
    title: "私たちについて"
    text: "Fundación Rosario Gatón (FRG)は、5大陸での活動展開を目指す非営利の人権および社会経済開発組織です。私たちは極度の貧困、社会的格差、飢餓を軽減し、ジェンダー暴力、テロ、人身売買、動物虐待を予防するためのパートナーシップを構築しています。また、最も脆弱な立場にある人々を支援し、社会的包摂、生活にふさわしい住まい、ミクロ経済、基本サービスへのアクセスを促進しています。"
    image: "photos/2019-01-23-se-reune-con-el-embajador-de-guatemala-para-fortalecer/01.webp"
    imageAlt: "Fundación Rosario Gatónと、República Dominicanaに駐在するグアテマラ大使との会議。"
    buttons:
      - label: "詳しく見る"
        href: "/ja/nosotros/"
  - type: "stats"
    items:
      - label: "設立からの年数"
        value: "20+"
      - label: "支援した人々"
        value: "15,000+"
      - label: "改善・建設された住宅"
        value: "125+"
      - label: "訓練を受けた起業家"
        value: "300+"
  - type: "video"
    title: "Fundación Rosario Gatónについて知る"
    url: "https://www.youtube.com/watch?v=xFp8-2GVoH8"
  - type: "programs"
    title: "人生を変えるプログラム"
    surface: false
    intro: "Fundación Rosario Gatónがコミュニティを変革し、人々の生活を変えるために実施しているプログラムをご覧ください。"
    programs:
      - "reduccion-de-la-pobreza-y-desigualdad-social"
      - "educacion-y-formacion-ciudadana"
      - "salud-y-seguridad-alimentaria"
      - "vivienda-digna-e-infraestructura-basica"
      - "apoyo-a-emprendimientos-y-microeconomia"
      - "inclusion-de-personas-con-discapacidad"
  - type: "latestPosts"
    title: "最新ニュースと出版物"
    surface: true
    limit: 3
  - type: "splitCta"
    title: "ボランティア・寄付"
    volunteer:
      title: "ボランティアとして参加する"
      text: "私たちの協力者ネットワークの一員となり、私たちと共に人々の人生を変えましょう。"
      button:
        label: "今すぐ参加！"
        href: "/ja/voluntariado/"
      image: "photos/2025-07-22-entrega-alimentos-a-familias-vulnerables-como-parte-de-su/06.webp"
      imageAlt: "ボランティア"
    donate:
      title: "寄付をする"
      text: "あなたのサポートは、脆弱なコミュニティの教育、育成、エンパワーメントを継続するために不可欠です。"
      button:
        label: "今すぐ寄付する"
        href: "/ja/donar/"
      image: "photos/2019-01-23-se-reune-con-el-embajador-de-guatemala-para-fortalecer/01.webp"
      imageAlt: "寄付"
  - type: "ambassadors"
    title: "親善大使"
    intro: "Fundación Rosario Gatónの価値を五大陸で体現しています。すでに大陸全般の大使および各国の大使を擁しており、その他の役職は、自国から連帯と国際協力を推進したい方々に引き続き開かれています。"
    surface: false
    # The people come from the `team` collection (continental and country
    # ambassadors, matched by `continent`). Only the vacant countries are kept
    # here: a vacancy is a country, not a person named "to be assigned".
    continents:
      - name: "アメリカ"
        continent: "america"
        openCountries:
          - "ドミニカ共和国"
      - name: "アフリカ"
        continent: "africa"
        openCountries:
          - "モロッコ"
          - "シエラレオネ"
      - name: "アジア"
        continent: "asia"
        openCountries:
          - "中国"
      - name: "ヨーロッパ"
        continent: "europa"
        openCountries:
          - "スペイン"
          - "フランス"
          - "ポルトガル"
      - name: "オセアニア"
        continent: "oceania"
        openCountries:
          - "オーストラリア"
          - "ニュージーランド"
          - "フィジー"
          - "パプアニューギニア"
  - type: "accordion"
    title: "よくある質問"
    surface: false
    items:
      - title: "Fundación Rosario Gatónとは何ですか？"
        text: "<p>持続可能な開発目標（SDGs）および国家開発戦略（END）に沿ったイニシアチブを推進し、人権と社会経済的発展のために活動する非営利団体です。</p>"
      - title: "財団はどのような分野で活動していますか？"
        text: "<p>保健、教育、環境、社会的包摂、尊厳ある住居、文化、スポーツ、暴力防止などの分野で活動しています。</p>"
      - title: "ボランティアとしてどのように協力できますか？"
        text: "<p>地域活動への参加、ワークショップのファシリテーション、事務支援、または制度的パートナーとしての参加が可能です。ボランティアセクションをご覧になり、フォームにご記入ください。</p>"
      - title: "寄付は受け付けていますか？どのように寄付できますか？"
        text: "<p>はい。金銭によるご寄付、現物寄付、およびパートナーシップを通じたご支援を受け付けております。銀行振込または「ご寄付のページ」よりお手続きいただけます。</p>"
      - title: "他の組織と協力して活動していますか？"
        text: "<p>はい。社会的インパクトを拡大するため、公的機関、民間企業、国際機関とパートナーシップを構築しています。</p>"
      - title: "活動についての情報はどのように入手できますか？"
        text: "<p>公式SNSをフォローしていただくか、お知らせのセクションをご覧ください。</p>"
  - type: "contactSection"
    title: "お問い合わせ"
    intro: "ご質問や、私たちのプログラムに関する詳細情報のご要望、協働のご希望、その他のお問い合わせなどがございましたら、いつでもお気軽にご連絡ください。心よりお待ちしております。"
    email: "info@fundacionrosariogaton.org"
    phone: "+1 (829) 649-3189"
    address: "República Dominicana"
    form: "contact"
    surface: true
---
