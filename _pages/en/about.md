---
permalink: /en/
title: "Jiawen Wu · Academic Website"
locale: en
author_profile: true
mirror: true
---

I am **Jiawen Wu (武嘉文)**, a Ph.D. student in Journalism and Communication at Nanjing University. I took my M.A. in Art History at Nanjing University's School of Arts, working on Han-dynasty material culture and imagery within art archaeology. My B.A. is in Broadcasting and Television Directing from Nanjing Xiaozhuang University, and I spent the autumn of 2023 on exchange at Eberhard Karls Universität Tübingen.

My work moves from Han-dynasty objects to historical imagery. My master's thesis was on the four-deity TLV mirror: I started from its ornament and asked how people in the Han period used images to arrange direction and order. My doctoral work is in visual history, focused on historical imagery of the Chinese nation. While studying I also interned at Xiaomi and JD.com on content operations and risk review.

Research Interests
======

* **Visual history**: historical imagery of the Chinese nation (doctoral work)
* **Art archaeology**: Han-dynasty material culture and imagery (master's work); thesis on the ornament of the four-deity TLV mirror and Han cosmology
* **AI applications and ethics**: trust and responsible reconstruction of communication in the age of large language models; lightweight LLM applications in the humanities

Education
======

* **Ph.D. student**, School of Journalism and Communication, Nanjing University — Journalism and Communication (050300), 2026.09 – present
    * Research: visual history · historical imagery of the Chinese nation
* **M.A.**, School of Arts, Nanjing University — Art History (130400), 2021.09 – 2024.06
    * Research: art archaeology · Han-dynasty material culture and imagery
    * Thesis: *A Study of the Ornament of the Four-Deity TLV Mirror and Related Questions*
    * Coursework in art history, archaeology and classical Chinese literature; ranked in the top 10%, repeatedly awarded academic scholarships
* **B.A.**, School of Journalism and Communication, Nanjing Xiaozhuang University — Broadcasting and Television Directing (130305), 2017.09 – 2021.06
    * Coursework in post-production, digital media, documentary, advertising and film/television studies; ranked in the top 10%
* **Exchange semester**, Eberhard Karls Universität Tübingen, Germany (inter-university agreement), 2023.10 – 2024.03

{% assign _honours = site.data.awards | where: "key", "honours" | first %}
Honours
======

{% if _honours %}{% for item in _honours.items %}* {{ item.text_en | default: item.text }}
{% endfor %}{% endif %}
Selected Work
======

* Wu, Jiawen. "The Four-Deity TLV Mirror and Han Cosmology." *Huaxia Wenhua*, 2025, (04): 27–32.
* Wu, Jiawen. "How to Trust: Rethinking Responsibility for Trust in the News and Communication System in the Age of Large Language Models." *Rongmei*, 2026, (9): 4–11.
* "Zhi and Wen in Four-Deity TLV Mirror Ornament," Fifth Mao Jiaqi History Forum, Nanjing University — Award of Excellence
* The publication list is on the [Publications](/en/publications/) page; the full record is in the [CV](/en/cv/).

Projects
======

  <ul>{% for post in site.portfolio %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>

Awards
======

{% include han-awards.html %}

The full version with level tags is on the [Awards and Honours](/en/timeline/) page.

Teaching
======

  <ul>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>

Talks and Summer Schools
======

  <ul>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</ul>

Contact
======

* Email: [wujiawen@smail.nju.edu.cn](mailto:wujiawen@smail.nju.edu.cn)
* Location: Nanjing, China
