---
layout: archive
title: "履历"
permalink: /cv/
author_profile: true
redirect_from:
    - /resume
---

{% include base_path %}

联系方式
======

{% include han-contact.html %}

教育背景
======

{% include han-education.html %}

工作与任职
======

* 2024.11 – 2025.05：上海交通大学文科建设处 科研管理（校聘）
    * 主导大模型轻应用竞赛、智慧文科论坛、院系 AI 赋能文科项目等

* 2022.09 – 2023.09：南京大学艺术学院 团委组织部部长
    * 负责团务建设，策划主题活动，管理团员档案

* 2022.09 – 2023.09：南京大学 3D 打印社 技术部部长

* 2022.04 – 2022.08：北京大学数字人文实验室 科研助理

* 2022.05 – 2023.05：中国人民大学 数字人文学生研究员

* 2021.09 – 2022.02：南京大学《创作方法与创新思维》课程助教

* 2020.12 – 2021.02：小米通讯技术有限公司 要闻运营实习生（互联网部三组内容分发部）
    * 负责信息流、PUSH 产品等内容，日均 100+ 条推送，提升分发效率
    * 实时监控热点事件，主导 2 次突发新闻快速响应
    * 优化推送文案与内容策略，CTR 提升 15%，次留率增长 8%
    * 基于用户画像分析 DAU、CVR 数据，参与产品优化，推动策略迭代

* 2021.03 – 2021.05：北京京东世纪贸易有限公司 资质审核实习生（京东商城中台大商超事业群）
    * 供应商与商品管理：审核自营 / POP 商家资质，分级核查商品合规
    * 数据驱动运营：整理商品资质数据，提供原始数据，支持可视化 BI 面板决策
    * 风控与算法优化：运用关键词算法模型跑宙斯盾比对识别违规内容，提升质控审核效率，终审排查商标侵权与合规风险

荣誉
======

{% include han-honours.html %}

获奖（国家、省、市、校级）
======

{% include han-awards.html %}

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

论文列表
======

  <div>{% for post in site.publications reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>

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
