---
layout: archive
title: "履历"
permalink: /cv/
author_profile: true
redirect_from:
    - /resume
---

{% include base_path %}

{% include han-cv-timeline.html %}

荣誉
======

{% include han-honours.html %}

论文列表
=======

  <div>{% for post in site.publications reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>

证书
======

* 江苏省计算机三级（软件技术及应用）
* 全国计算机二级 OFFICE
* 英语六级 473 / 四级 580 / Duolingo 120
* 普通话二级甲等
* 人工智能训练师（高级）
* 微调工程师、智能体工程师

技能
======

* **编程与数据**：Python、JavaScript、Rust、SQL、Linux、爬虫、AI Agent、RAG
* **设计与产品**：Visio、Figma、PRD、分镜头脚本、PS、PR、AE
* **开源项目**：安卓安全项目 DroidSeal，npm 下载量超过 1.2K（`droidseal`）

会议与暑期学校
======

  <div>{% for post in site.talks reversed %}
    {% include archive-single-talk-cv.html  %}
  {% endfor %}</div>

教学与助教
======

  <div>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>
