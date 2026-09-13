---
layout: archive
title: "站点地图"
permalink: /sitemap/
author_profile: true
---

{% include base_path %}

本页列出站点上的全部页面与条目。另有一份给搜索引擎的 [XML 版本]({{ base_path }}/sitemap.xml)。

<h2>页面</h2>
{% for post in site.pages %}
  {% unless post.url == page.url or post.sitemap == false %}
    {% include archive-single.html %}
  {% endunless %}
{% endfor %}

<h2>论文</h2>
{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}

<h2>项目</h2>
{% for post in site.portfolio %}
  {% include archive-single.html %}
{% endfor %}

<h2>会议与暑期学校</h2>
{% for post in site.talks %}
  {% include archive-single-talk.html %}
{% endfor %}

<h2>教学</h2>
{% for post in site.teaching reversed %}
  {% include archive-single.html %}
{% endfor %}
