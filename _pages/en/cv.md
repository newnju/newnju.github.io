---
layout: archive
title: "Curriculum Vitae"
permalink: /en/cv/
locale: en
author_profile: true
---

{% include base_path %}

Honours
======

{% include han-honours.html %}

{% include han-cv-timeline.html %}

Certificates
======

* Jiangsu Provincial Computer Level 3 (Software Technology and Applications)
* National Computer Level 2 (Office)
* CET-6 473 / CET-4 580 / Duolingo 120
* Putonghua Level 2A
* AI Trainer (Advanced)
* Fine-tuning Engineer; Agent Engineer

Skills
======

* **Programming and data**: Python, JavaScript, Rust, SQL, Linux, web scraping, AI agents, RAG
* **Design and product**: Visio, Figma, PRD, storyboarding, Photoshop, Premiere Pro, After Effects
* **Open source**: DroidSeal, an Android security project with 1.2K+ npm downloads (`droidseal`)

Publication List
======

  <div>{% for post in site.publications reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>

Talks and Summer Schools
======

  <div>{% for post in site.talks reversed %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</div>

Teaching
======

  <div>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>
