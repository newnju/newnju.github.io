---
permalink: /
title: "主页"
author_profile: true
mirror: true
redirect_from: 
    - /about/
    - /about.html
---

我是**武嘉文**，南京大学新闻传播学院新闻传播学博士研究生，研究方向为影像史学与中华民族历史影像。硕士毕业于南京大学艺术学院美术学（美术考古方向），本科毕业于南京晓庄学院广播电视编导专业；2023 年 10 月至 2024 年 3 月在德国图宾根大学（Eberhard Karls Universität Tübingen）交换一学期。

教育背景
======

{% include han-education.html %}

荣誉
======

{% include han-honours.html %}

近期成果
======

{% include han-recent-pubs.html %}
* 论文列表见 [论文](/publications/) 页；完整履历见 [履历](/cv/)

项目
======

  <div>{% for post in site.portfolio %}
    {% include archive-single.html %}
  {% endfor %}</div>

获奖
======

{% include han-awards.html %}

带等级标签的完整版见 [获奖与荣誉](/timeline/) 页。

教学
======

  <div>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</div>

会议与暑期学校
======

  <div>{% for post in site.talks %}
    {% include archive-single-talk-cv.html %}
  {% endfor %}</div>

联系方式
======

{% include han-contact.html %}
